import { useState } from 'react'
import { Check, LoaderCircle, Send } from 'lucide-react'
import type { MemoryResult } from '../api'

interface GapFillCardProps {
  gaps: string[]
  onResolve: (gap: string, answer: string) => Promise<MemoryResult>
}

export function GapFillCard({ gaps, onResolve }: GapFillCardProps) {
  return (
    <section className="gap-card" aria-label="Knowledge gaps">
      <div className="gap-card-heading">
        <span className="gap-badge">Needs confirmation</span>
        <h3>Fill a knowledge gap</h3>
        <p>Add a confirmed answer to the local knowledge base.</p>
      </div>
      <div className="gap-list">
        {gaps.map((gap, index) => <GapItem key={`${gap}-${index}`} gap={gap} onResolve={onResolve} />)}
      </div>
    </section>
  )
}

function GapItem({ gap, onResolve }: { gap: string; onResolve: GapFillCardProps['onResolve'] }) {
  const [answer, setAnswer] = useState('')
  const [busy, setBusy] = useState(false)
  const [savedFile, setSavedFile] = useState('')
  const [error, setError] = useState('')

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!answer.trim() || busy || savedFile) return
    setBusy(true)
    setError('')
    try {
      const result = await onResolve(gap, answer.trim())
      setSavedFile(`${result.fileName}${result.indexed ? '' : ' (saved; reindex needed)'}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not save the answer.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="gap-item" onSubmit={submit}>
      <p>{gap}</p>
      {savedFile ? (
        <div className="gap-saved"><Check size={15} /> Added to <strong>{savedFile}</strong></div>
      ) : (
        <div className="gap-answer-row">
          <input value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Enter a confirmed answer…" aria-label={`Answer: ${gap}`} required />
          <button className="button button-small" type="submit" disabled={busy || !answer.trim()}>
            {busy ? <LoaderCircle className="spin" size={15} /> : <Send size={14} />}
            Save
          </button>
        </div>
      )}
      {error ? <p className="gap-error">{error}</p> : null}
    </form>
  )
}
