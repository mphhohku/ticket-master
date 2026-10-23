import { useEffect, useState } from 'react'
import { BookOpenText, CircleHelp, MessageSquareText, Settings2, ShieldCheck, Sparkles } from 'lucide-react'
import { providerHeaders, requestJson, type AppConfig, type MemoryResult, type ProviderSettings } from './api'
import { ChatWindow, type ChatMessage, type ChatMode } from './components/ChatWindow'
import { KBExplorer } from './components/KBExplorer'
import { SettingsModal } from './components/SettingsModal'
import './App.css'

type AppView = 'assistant' | 'knowledge'

function App() {
  const [view, setView] = useState<AppView>('assistant')
  const [mode, setMode] = useState<ChatMode>('draft')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [busy, setBusy] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [configError, setConfigError] = useState('')

  useEffect(() => {
    requestJson<AppConfig>('/api/config')
      .then((value) => {
        setConfig(value)
        setSettings({ llm: { ...value.llm }, embeddings: { ...value.embeddings } })
      })
      .catch((reason: unknown) => setConfigError(reason instanceof Error ? reason.message : 'Could not load provider configuration.'))
  }, [])

  async function runAgent(path: '/api/agents/draft' | '/api/agents/memory', fields: Record<string, string>, files: File[] = []) {
    if (!settings) throw new Error('Provider settings are still loading. Please try again.')
    const headers = providerHeaders(settings)
    let body: BodyInit
    if (files.length) {
      const form = new FormData()
      Object.entries(fields).forEach(([key, value]) => form.append(key, value))
      files.forEach((file) => form.append('files', file))
      body = form
    } else {
      headers['Content-Type'] = 'application/json'
      body = JSON.stringify(fields)
    }
    return requestJson<Record<string, unknown>>(path, { method: 'POST', headers, body })
  }

  async function sendMessage(message: string, files: File[], chatMode: ChatMode) {
    const userId = crypto.randomUUID()
    setMessages((current) => [...current, {
      id: userId,
      role: 'user',
      text: message,
      attachments: files.map((file) => file.name),
    }])
    setBusy(true)
    try {
      if (chatMode === 'draft') {
        const result = await runAgent('/api/agents/draft', { message }, files)
        const draft = typeof result.draftResponse === 'string' ? result.draftResponse : 'The assistant returned no draft.'
        setMessages((current) => [...current, {
          id: crypto.randomUUID(),
          role: 'assistant',
          text: draft,
          sources: Array.isArray(result.sourcesUsed) ? result.sourcesUsed.filter((value): value is string => typeof value === 'string') : [],
          gaps: Array.isArray(result.knowledgeGaps) ? result.knowledgeGaps.filter((value): value is string => typeof value === 'string') : [],
        }])
      } else {
        const result = await runAgent('/api/agents/memory', { message }, files) as unknown as MemoryResult
        setMessages((current) => [...current, memoryMessage(result)])
      }
    } catch (reason) {
      setMessages((current) => [...current, {
        id: crypto.randomUUID(), role: 'assistant', isError: true,
        text: reason instanceof Error ? reason.message : 'The request failed. Check your provider settings and try again.',
      }])
    } finally {
      setBusy(false)
    }
  }

  async function resolveGap(gap: string, answer: string): Promise<MemoryResult> {
    const result = await runAgent('/api/agents/memory', { gap, answer }) as unknown as MemoryResult
    return result
  }

  function memoryMessage(result: MemoryResult): ChatMessage {
    const status = result.indexed ? 'The search index is up to date.' : `Saved, but reindexing failed: ${result.indexingError ?? 'reindex the knowledge base manually.'}`
    return {
      id: crypto.randomUUID(), role: 'assistant', memory: result,
      text: `${result.action === 'create' ? 'Created a new article' : 'Updated an article'} in the local knowledge base. ${status}`,
    }
  }

  function applySettings(next: ProviderSettings, nextConfig: AppConfig) {
    setSettings(next)
    setConfig(nextConfig)
    setConfigError('')
  }

  const missingCredentials = config && (!config.llm.configured || !config.embeddings.configured)

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><div className="brand-mark"><Sparkles size={19} /></div><div className="brand-name">Ticket<span>mate</span><small>LOCAL SUPPORT WORKSPACE</small></div></div>
        <button className="new-chat-button" onClick={() => { setView('assistant'); setMessages([]); setMode('draft') }}><span>＋</span> New conversation</button>
        <nav className="side-nav" aria-label="Workspace navigation">
          <p className="nav-label">WORKSPACE</p>
          <button className={`nav-item ${view === 'assistant' ? 'active' : ''}`} onClick={() => setView('assistant')}><MessageSquareText size={17} /> Assistant</button>
          <button className={`nav-item ${view === 'knowledge' ? 'active' : ''}`} onClick={() => setView('knowledge')}><BookOpenText size={17} /> Knowledge base</button>
        </nav>
        <div className="sidebar-spacer" />
        <div className="local-notice"><ShieldCheck size={16} /><p><strong>Local-first by design</strong><br />Your tickets and articles stay on this machine.</p></div>
        <button className="nav-item settings-nav" onClick={() => setShowSettings(true)}><Settings2 size={17} /> Provider settings{missingCredentials ? <span className="warning-dot" /> : null}</button>
        <a className="help-link" href="https://github.com/mphhohku/ticket-master" target="_blank" rel="noreferrer"><CircleHelp size={15} /> Setup & help</a>
        <div className="sidebar-footer">Private workspace <span>·</span> API keys are server-side</div>
      </aside>
      <div className="main-area">
        {view === 'assistant' ? (
          <ChatWindow messages={messages} mode={mode} busy={busy} onModeChange={setMode} onSend={sendMessage} onResolveGap={resolveGap} />
        ) : <KBExplorer settings={settings} onSettings={() => setShowSettings(true)} />}
        {configError ? <div className="config-toast">Could not load provider settings: {configError}</div> : null}
        {missingCredentials ? <div className="setup-banner"><span><ShieldCheck size={16} /> Add server credentials to enable AI workflows.</span><button onClick={() => setShowSettings(true)}>View setup</button></div> : null}
      </div>
      {showSettings ? <SettingsModal onClose={() => setShowSettings(false)} onSave={applySettings} /> : null}
    </main>
  )
}

export default App
