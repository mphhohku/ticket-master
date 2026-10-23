export interface ProviderConfig {
  configured: boolean
  baseUrl: string
  model: string
}

export interface AppConfig {
  llm: ProviderConfig
  embeddings: ProviderConfig
}

export interface MemoryResult {
  action: 'create' | 'update'
  fileName: string
  content: string
  sourceFiles: string[]
  indexed: boolean
  indexingError?: string
}

export type ProviderSettings = Pick<AppConfig, 'llm' | 'embeddings'>

export function providerHeaders(settings: ProviderSettings): Record<string, string> {
  return {
    'x-llm-base-url': settings.llm.baseUrl,
    'x-model': settings.llm.model,
    'x-embedding-base-url': settings.embeddings.baseUrl,
    'x-embedding-model': settings.embeddings.model,
  }
}

export async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init)
  const body: unknown = await response.json().catch(() => ({}))
  if (!response.ok) {
    const message = isRecord(body) && typeof body.error === 'string'
      ? body.error
      : `Request failed (${response.status}).`
    throw new Error(message)
  }
  return body as T
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
