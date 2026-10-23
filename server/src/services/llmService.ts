import OpenAI from 'openai'
import type { Request } from 'express'
import { HttpError } from '../errors.js'

const defaultBaseUrl = 'https://api.openai.com/v1'
const defaultModel = 'gpt-4o-mini'

export interface LlmConfiguration {
  apiKey: string
  baseUrl: string
  model: string
}

export type LlmUserContent =
  | string
  | OpenAI.Chat.Completions.ChatCompletionContentPart[]

export function getLlmConfiguration(request: Request): LlmConfiguration {
  const apiKey =
    process.env.LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    request.get('x-llm-api-key')?.trim() ||
    request.get('x-api-key')?.trim() ||
    getBearerToken(request.get('authorization'))
  if (!apiKey) {
    throw new HttpError('Set LLM_API_KEY in the server environment before using agent workflows.', 400)
  }

  const baseUrl =
    request.get('x-llm-base-url')?.trim() ||
    request.get('x-base-url')?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    defaultBaseUrl
  const model = request.get('x-model')?.trim() || process.env.LLM_MODEL?.trim() || defaultModel
  if (model.length > 256) {
    throw new HttpError('LLM model name is too long.', 400)
  }

  return { apiKey, baseUrl: normalizeBaseUrl(baseUrl), model }
}

export function getPublicLlmConfiguration() {
  return {
    configured: Boolean(process.env.LLM_API_KEY?.trim() || process.env.OPENAI_API_KEY?.trim()),
    baseUrl: process.env.LLM_BASE_URL?.trim() || defaultBaseUrl,
    model: process.env.LLM_MODEL?.trim() || defaultModel,
  }
}

export async function completeJson<T>(
  configuration: LlmConfiguration,
  systemPrompt: string,
  userContent: LlmUserContent,
): Promise<T> {
  const client = new OpenAI({
    apiKey: configuration.apiKey,
    baseURL: `${configuration.baseUrl}/`,
    timeout: 60_000,
    maxRetries: 0,
  })

  let content: string | null | undefined
  try {
    const completion = await client.chat.completions.create({
      model: configuration.model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    })
    content = completion.choices[0]?.message.content
  } catch {
    throw new HttpError('The configured LLM provider request failed.', 502)
  }

  if (!content) {
    throw new HttpError('The LLM provider returned an empty response.', 502)
  }

  try {
    return JSON.parse(content) as T
  } catch {
    throw new HttpError('The LLM provider returned invalid JSON.', 502)
  }
}

function normalizeBaseUrl(value: string): string {
  if (value.length > 2048) {
    throw new HttpError('LLM base URL is too long.', 400)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new HttpError('A valid LLM base URL is required.', 400)
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new HttpError('LLM base URL must use HTTP or HTTPS without credentials, query, or fragment.', 400)
  }

  return `${url.origin}${url.pathname.replace(/\/+$/, '')}`
}

function getBearerToken(value: string | undefined): string {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  return match?.[1].trim() ?? ''
}
