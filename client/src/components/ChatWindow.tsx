import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { ArrowDown, Bot, CircleHelp, LoaderCircle, Send, Sparkles, UserRound } from 'lucide-react'
import type { MemoryResult } from '../api'
import { FileUploader } from './FileUploader'
import { GapFillCard } from './GapFillCard'

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  attachments?: string[]
  sources?: string[]
  gaps?: string[]
  memory?: MemoryResult
  isError?: boolean
}

export type ChatMode = 'draft' | 'memory'

interface ChatWindowProps {
  messages: ChatMessage[]
  mode: ChatMode
  busy: boolean
  onModeChange: (mode: ChatMode) => void
  onSend: (message: string, files: File[], mode: ChatMode) => Promise<void>
  onResolveGap: (gap: string, answer: string) => Promise<MemoryResult>
}

export function ChatWindow({ messages, mode, busy, onModeChange, onSend, onResolveGap }: ChatWindowProps) {
  const [message, setMessage] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [showScrollButton, setShowScrollButton] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, busy])

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || (!message.trim() && files.length === 0)) return
    const submittedMessage = message.trim()
    const submittedFiles = [...files]
    setMessage('')
    setFiles([])
    void onSend(submittedMessage, submittedFiles, mode)
  }

  function handleScroll() {
    const element = scrollRef.current
    if (!element) return
    setShowScrollButton(element.scrollHeight - element.scrollTop - element.clientHeight > 240)
  }

  return (
    <section className="chat-panel">
      <header className="chat-header">
        <div className="chat-title">
          <div className="chat-avatar"><Sparkles size={18} /></div>
          <div><h1>Ticket assistant</h1><p>Draft accurate replies from your local knowledge</p></div>
        </div>
        <div className="mode-switch" role="group" aria-label="Assistant mode">
          <button className={mode === 'draft' ? 'active' : ''} onClick={() => onModeChange('draft')} type="button"><Sparkles size={15} /> Draft reply</button>
          <button className={mode === 'memory' ? 'active' : ''} onClick={() => onModeChange('memory')} type="button"><Bot size={15} /> Save knowledge</button>
        </div>
      </header>
      <div className="conversation" ref={scrollRef} onScroll={handleScroll}>
        {messages.length === 0 ? (
          <div className="empty-chat">
            <div className="empty-chat-icon"><Sparkles size={25} /></div>
            <h2>{mode === 'draft' ? 'What can I help you resolve?' : 'What should the knowledge base learn?'}</h2>
            <p>{mode === 'draft'
              ? 'Share a customer ticket or attach supporting files. I’ll draft a grounded reply and flag anything that needs confirmation.'
              : 'Add a confirmed resolution, policy update, or support document. The assistant will save it to your local knowledge base.'}</p>
            <div className="suggestion-row">
              <button type="button" onClick={() => setMessage('A customer says their refund has not arrived. Draft a clear reply using our policy.')}>Draft a ticket reply</button>
              <button type="button" onClick={() => onModeChange('memory')}>Add a resolution</button>
            </div>
          </div>
        ) : (
          <div className="message-list">
            {messages.map((item) => (
              <article className={`message-row ${item.role}`} key={item.id}>
                <div className={`message-avatar ${item.role}`} aria-hidden="true">{item.role === 'assistant' ? <Sparkles size={16} /> : <UserRound size={16} />}</div>
                <div className="message-content">
                  <div className="message-meta">{item.role === 'assistant' ? 'Assistant' : 'You'} <span>·</span> {item.role === 'assistant' ? 'Ticket support' : 'Just now'}</div>
                  {item.role === 'assistant' ? (
                    <div className={`markdown-body ${item.isError ? 'error-message' : ''}`}><ReactMarkdown>{item.text}</ReactMarkdown></div>
                  ) : <p className="user-message-text">{item.text || 'Please review the attached files.'}</p>}
                  {item.attachments?.length ? <div className="message-attachments">{item.attachments.map((name) => <span key={name}>{name}</span>)}</div> : null}
                  {item.sources?.length ? <div className="source-list"><span>Sources</span>{item.sources.map((source) => <span className="source-chip" key={source}>{source}</span>)}</div> : null}
                  {item.memory ? <div className="memory-result"><span className="saved-check">✓</span><span>{item.memory.action === 'create' ? 'Created' : 'Updated'} <strong>{item.memory.fileName}</strong></span><span className={`index-state ${item.memory.indexed ? 'ready' : 'needs-index'}`}>{item.memory.indexed ? 'Indexed' : 'Reindex needed'}</span>{item.memory.indexingError ? <small>{item.memory.indexingError}</small> : null}</div> : null}
                  {item.gaps?.length ? <GapFillCard gaps={item.gaps} onResolve={onResolveGap} /> : null}
                </div>
              </article>
            ))}
            {busy ? <div className="thinking-row"><div className="message-avatar assistant"><Sparkles size={16} /></div><span><LoaderCircle className="spin" size={15} /> Working with your local knowledge base…</span></div> : null}
            <div ref={bottomRef} />
          </div>
        )}
        {showScrollButton ? <button className="scroll-bottom" onClick={() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' })} aria-label="Scroll to latest message"><ArrowDown size={17} /></button> : null}
      </div>
      <div className="composer-wrap">
        <div className="mode-hint"><CircleHelp size={14} /> {mode === 'draft' ? 'Draft mode retrieves relevant local articles and identifies missing facts.' : 'Memory mode adds a confirmed answer or document to your local knowledge base.'}</div>
        <form className="composer" onSubmit={submit}>
          <textarea
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.form?.requestSubmit()
              }
            }}
            placeholder={mode === 'draft' ? 'Paste a ticket or describe what you need…' : 'Share the confirmed resolution or knowledge…'}
            rows={3}
            disabled={busy}
          />
          <div className="composer-bottom">
            <FileUploader files={files} onChange={setFiles} disabled={busy} />
            <button className="send-button" type="submit" disabled={busy || (!message.trim() && files.length === 0)} aria-label="Send message"><Send size={17} /><span>{mode === 'draft' ? 'Draft reply' : 'Save knowledge'}</span></button>
          </div>
        </form>
        <p className="composer-disclaimer">Review generated content before sharing it with a customer.</p>
      </div>
    </section>
  )
}
