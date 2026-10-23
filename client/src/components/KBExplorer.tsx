import { useCallback, useEffect, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Check, FilePlus2, FileText, LoaderCircle, Pencil, RefreshCw, Save, Trash2, X } from 'lucide-react'
import { providerHeaders, requestJson, type ProviderSettings } from '../api'

interface KBExplorerProps {
  settings: ProviderSettings | null
  onSettings: () => void
}

export function KBExplorer({ settings, onSettings }: KBExplorerProps) {
  const [files, setFiles] = useState<string[]>([])
  const [selected, setSelected] = useState('')
  const [content, setContent] = useState('')
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const refreshFiles = useCallback(async (preferredFile?: string, currentSelected = '') => {
    const result = await requestJson<{ files: string[] }>('/api/kb')
    setFiles(result.files)
    const next = preferredFile && result.files.includes(preferredFile)
      ? preferredFile
      : currentSelected && result.files.includes(currentSelected)
        ? currentSelected
        : result.files[0] ?? ''
    setSelected(next)
    if (next) {
      const file = await requestJson<{ content: string }>(`/api/kb/${encodeURIComponent(next)}`)
      setContent(file.content)
    } else {
      setContent('')
    }
  }, [])

  useEffect(() => {
    let mounted = true
    const loadInitialFiles = async () => {
      try {
        const result = await requestJson<{ files: string[] }>('/api/kb')
        if (!mounted) return
        setFiles(result.files)
        const firstFile = result.files[0] ?? ''
        setSelected(firstFile)
        if (firstFile) {
          const file = await requestJson<{ content: string }>(`/api/kb/${encodeURIComponent(firstFile)}`)
          if (mounted) setContent(file.content)
        }
      } catch (reason) {
        if (mounted) setError(reason instanceof Error ? reason.message : 'Could not load the knowledge base.')
      } finally {
        if (mounted) setLoading(false)
      }
    }
    void loadInitialFiles()
    return () => { mounted = false }
  }, [])

  async function selectFile(fileName: string) {
    setSelected(fileName)
    setCreating(false)
    setEditing(false)
    setError('')
    setLoading(true)
    try {
      const file = await requestJson<{ content: string }>(`/api/kb/${encodeURIComponent(fileName)}`)
      setContent(file.content)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read that file.')
    } finally {
      setLoading(false)
    }
  }

  async function saveFile(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError('')
    setNotice('')
    try {
      if (creating) {
        const result = await requestJson<{ fileName: string }>('/api/kb', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fileName: newName.trim(), content }),
        })
        await refreshFiles(result.fileName, selected)
        setCreating(false)
      } else {
        await requestJson(`/api/kb/${encodeURIComponent(selected)}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ content }),
        })
        setEditing(false)
      }
      setNotice('Saved locally. Reindex to refresh search results.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the file.')
    } finally {
      setSaving(false)
    }
  }

  async function deleteFile() {
    if (!selected || !window.confirm(`Delete ${selected} from the local knowledge base?`)) return
    setLoading(true)
    setError('')
    try {
      await requestJson(`/api/kb/${encodeURIComponent(selected)}`, { method: 'DELETE' })
      await refreshFiles(undefined, selected)
      setNotice('File deleted. Reindex to refresh search results.')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete the file.')
    } finally {
      setLoading(false)
    }
  }

  async function reindex() {
    setLoading(true)
    setError('')
    setNotice('')
    try {
      if (!settings) throw new Error('Load provider settings before reindexing.')
      const result = await requestJson<{ filesIndexed: number; chunksIndexed: number }>('/api/kb/reindex', {
        method: 'POST', headers: providerHeaders(settings),
      })
      setNotice(`Search index refreshed · ${result.filesIndexed} files · ${result.chunksIndexed} chunks`)
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : 'Could not reindex the knowledge base.'
      setError(message)
      if (message.includes('API_KEY') || message.includes('credential')) onSettings()
    } finally {
      setLoading(false)
    }
  }

  function startNewFile() {
    setCreating(true)
    setEditing(true)
    setSelected('')
    setNewName('')
    setContent('# New knowledge article\n\n')
    setError('')
    setNotice('')
  }

  return (
    <section className="kb-page">
      <header className="kb-header">
        <div><p className="eyebrow">LOCAL KNOWLEDGE</p><h1>Knowledge base</h1><p>Manage Markdown articles used to ground ticket replies.</p></div>
        <button className="button button-primary" onClick={startNewFile}><FilePlus2 size={16} /> New article</button>
      </header>
      <div className="kb-workspace">
        <aside className="kb-list-panel">
          <div className="kb-list-heading"><span>Articles <b>{files.length}</b></span><button className="icon-button" aria-label="Refresh article list" onClick={() => { setLoading(true); refreshFiles(undefined, selected).catch((reason: unknown) => setError(String(reason))).finally(() => setLoading(false)) }}><RefreshCw size={15} /></button></div>
          {files.map((fileName) => <button className={`kb-file-row ${selected === fileName && !creating ? 'selected' : ''}`} key={fileName} onClick={() => void selectFile(fileName)}><FileText size={16} /><span>{fileName}</span></button>)}
          {!files.length && !loading ? <p className="kb-empty-list">No Markdown articles yet.</p> : null}
        </aside>
        <div className="kb-editor-panel">
          {loading ? <div className="kb-state"><LoaderCircle className="spin" size={20} /> Working…</div> : null}
          {!loading && (selected || creating) ? (
            <>
              <div className="kb-document-toolbar">
                {creating ? <input className="new-file-input" value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="article-name.md" aria-label="New article filename" /> : <h2><FileText size={17} />{selected}</h2>}
                <div className="toolbar-actions">
                  {!editing && !creating ? <button className="icon-button" onClick={() => setEditing(true)} title="Edit article" aria-label="Edit article"><Pencil size={16} /></button> : null}
                  {!editing && !creating ? <button className="icon-button danger" onClick={() => void deleteFile()} title="Delete article" aria-label="Delete article"><Trash2 size={16} /></button> : null}
                  <button className="icon-button" onClick={() => void reindex()} title="Reindex search" aria-label="Reindex search"><RefreshCw size={16} /></button>
                </div>
              </div>
              {editing ? (
                <form className="kb-edit-form" onSubmit={saveFile}>
                  <textarea value={content} onChange={(event) => setContent(event.target.value)} spellCheck />
                  <div className="editor-actions"><button className="button button-subtle" type="button" onClick={() => { if (creating) { setCreating(false); setSelected(files[0] ?? '') } else { setEditing(false); if (selected) void selectFile(selected) } }}><X size={15} /> Cancel</button><button className="button button-primary" type="submit" disabled={saving || !content.trim() || (creating && !newName.trim())}>{saving ? <LoaderCircle className="spin" size={15} /> : <Save size={15} />} Save article</button></div>
                </form>
              ) : <div className="kb-markdown"><ReactMarkdown>{content}</ReactMarkdown></div>}
            </>
          ) : !loading ? <div className="kb-state"><FileText size={23} /><h2>Your knowledge lives here</h2><p>Add a Markdown article or reindex existing files to make them searchable.</p><button className="button button-subtle" onClick={() => void reindex()}><RefreshCw size={15} /> Build search index</button></div> : null}
          {notice ? <p className="kb-notice"><Check size={14} />{notice}</p> : null}
          {error ? <p className="inline-error">{error}</p> : null}
        </div>
      </div>
    </section>
  )
}
