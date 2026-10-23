import { useEffect, useState } from 'react'
import { Check, KeyRound, LoaderCircle, X } from 'lucide-react'
import type { AppConfig, ProviderSettings } from '../api'
import { requestJson } from '../api'

interface SettingsModalProps {
  onClose: () => void
  onSave: (settings: ProviderSettings, config: AppConfig) => void
}

export function SettingsModal({ onClose, onSave }: SettingsModalProps) {
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [settings, setSettings] = useState<ProviderSettings | null>(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    requestJson<AppConfig>('/api/config')
      .then((value) => {
        setConfig(value)
        setSettings({
          llm: { ...value.llm },
          embeddings: { ...value.embeddings },
        })
      })
      .catch((reason: unknown) => setError(reason instanceof Error ? reason.message : 'Could not load configuration.'))
      .finally(() => setLoading(false))
  }, [])

  function updateProvider(provider: 'llm' | 'embeddings', field: 'baseUrl' | 'model', value: string) {
    setSettings((current) => current && ({
      ...current,
      [provider]: { ...current[provider], [field]: value },
    }))
  }

  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (config && settings) onSave(settings, config)
    onClose()
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <header className="modal-header">
          <div className="modal-title-wrap">
            <span className="settings-icon"><KeyRound size={18} /></span>
            <div>
              <h2 id="settings-title">Provider settings</h2>
              <p>Credentials stay on your server.</p>
            </div>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close settings"><X size={18} /></button>
        </header>
        {loading ? <div className="modal-loading"><LoaderCircle className="spin" size={20} /> Checking server configuration…</div> : null}
        {error ? <p className="inline-error">{error}</p> : null}
        {settings && config ? (
          <form onSubmit={save} className="settings-form">
            <p className="privacy-note"><KeyRound size={16} /> API keys are read from the server environment and are never sent to or stored in this browser.</p>
            <ProviderFields
              title="Chat model"
              provider="llm"
              value={settings.llm}
              configured={config.llm.configured}
              onChange={(field, value) => updateProvider('llm', field, value)}
            />
            <ProviderFields
              title="Embeddings"
              provider="embeddings"
              value={settings.embeddings}
              configured={config.embeddings.configured}
              onChange={(field, value) => updateProvider('embeddings', field, value)}
            />
            <p className="settings-footnote">Endpoint and model overrides apply only until this page is refreshed. Set secrets in the server <code>.env</code> file.</p>
            <footer className="modal-actions">
              <button className="button button-subtle" type="button" onClick={onClose}>Cancel</button>
              <button className="button button-primary" type="submit"><Check size={16} /> Apply settings</button>
            </footer>
          </form>
        ) : null}
      </section>
    </div>
  )
}

function ProviderFields({
  title,
  provider,
  value,
  configured,
  onChange,
}: {
  title: string
  provider: 'llm' | 'embeddings'
  value: AppConfig['llm']
  configured: boolean
  onChange: (field: 'baseUrl' | 'model', value: string) => void
}) {
  return (
    <fieldset className="provider-fields">
      <legend>{title}</legend>
      <div className={`config-status ${configured ? 'is-configured' : 'is-missing'}`}>
        <span className="status-dot" />
        {configured ? 'Server credential detected' : `Missing ${provider === 'llm' ? 'LLM_API_KEY' : 'EMBEDDING_API_KEY'}`}
      </div>
      <label>
        API base URL
        <input value={value.baseUrl} onChange={(event) => onChange('baseUrl', event.target.value)} required />
      </label>
      <label>
        Model
        <input value={value.model} onChange={(event) => onChange('model', event.target.value)} required />
      </label>
    </fieldset>
  )
}
