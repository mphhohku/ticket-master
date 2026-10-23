import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { dirname } from 'node:path'
import type { Request } from 'express'
import { HttpError } from '../errors.js'
import {
  getVectorIndexPath,
  listKnowledgeBaseFiles,
  readKnowledgeBaseFile,
} from './knowledgeBaseService.js'

const defaultEmbeddingBaseUrl = 'https://api.openai.com/v1'
export const defaultEmbeddingModel = 'text-embedding-3-small'
const chunkSize = 1200
const chunkOverlap = 200
const embeddingBatchSize = 64

interface EmbeddingConfiguration {
  apiKey: string
  baseUrl: string
  model: string
}

interface VectorChunk {
  fileName: string
  textContent: string
  embedding: number[]
}

interface VectorIndex {
  version: 1
  model: string
  baseUrl: string
  updatedAt: string
  fileHashes: Record<string, string>
  chunks: VectorChunk[]
}

export interface SearchResult {
  fileName: string
  textContent: string
  score: number
}

export function getEmbeddingConfiguration(request: Request): EmbeddingConfiguration {
  const apiKey =
    process.env.EMBEDDING_API_KEY?.trim() ||
    process.env.LLM_API_KEY?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    request.get('x-embedding-api-key')?.trim() ||
    request.get('x-api-key')?.trim() ||
    getBearerToken(request.get('authorization'))
  if (!apiKey) {
    throw new HttpError('Set EMBEDDING_API_KEY or LLM_API_KEY in the server environment before using retrieval.', 400)
  }

  const baseUrl =
    request.get('x-embedding-base-url')?.trim() ||
    request.get('x-base-url')?.trim() ||
    process.env.EMBEDDING_BASE_URL?.trim() ||
    process.env.LLM_BASE_URL?.trim() ||
    defaultEmbeddingBaseUrl
  const model =
    request.get('x-embedding-model')?.trim() ||
    process.env.EMBEDDING_MODEL?.trim() ||
    defaultEmbeddingModel
  if (model.length > 256) {
    throw new HttpError('Embedding model name is too long.', 400)
  }

  return { apiKey, baseUrl: normalizeBaseUrl(baseUrl), model }
}

export function getPublicEmbeddingConfiguration() {
  return {
    configured: Boolean(
      process.env.EMBEDDING_API_KEY?.trim() ||
      process.env.LLM_API_KEY?.trim() ||
      process.env.OPENAI_API_KEY?.trim(),
    ),
    baseUrl:
      process.env.EMBEDDING_BASE_URL?.trim() ||
      process.env.LLM_BASE_URL?.trim() ||
      defaultEmbeddingBaseUrl,
    model: process.env.EMBEDDING_MODEL?.trim() || defaultEmbeddingModel,
  }
}

export async function reindexKnowledgeBase(configuration: EmbeddingConfiguration) {
  const fileNames = await listKnowledgeBaseFiles()
  const fileHashes: Record<string, string> = {}
  const pendingChunks: Array<Pick<VectorChunk, 'fileName' | 'textContent'>> = []

  for (const fileName of fileNames) {
    const content = await readKnowledgeBaseFile(fileName)
    fileHashes[fileName] = hashContent(content)
    for (const textContent of splitIntoChunks(content)) {
      pendingChunks.push({ fileName, textContent })
    }
  }

  const chunks: VectorChunk[] = []
  let vectorDimension: number | undefined
  for (let start = 0; start < pendingChunks.length; start += embeddingBatchSize) {
    const batch = pendingChunks.slice(start, start + embeddingBatchSize)
    const vectors = await requestEmbeddings(batch.map((chunk) => chunk.textContent), configuration)

    for (const [index, embedding] of vectors.entries()) {
      if (vectorDimension !== undefined && embedding.length !== vectorDimension) {
        throw new HttpError('The embedding provider returned inconsistent vector dimensions.', 502)
      }
      vectorDimension = embedding.length
      chunks.push({ ...batch[index], embedding })
    }
  }

  const index: VectorIndex = {
    version: 1,
    model: configuration.model,
    baseUrl: configuration.baseUrl,
    updatedAt: new Date().toISOString(),
    fileHashes,
    chunks,
  }
  await writeIndex(index)

  return { filesIndexed: fileNames.length, chunksIndexed: chunks.length, model: configuration.model }
}

export async function reindexKnowledgeBaseFile(fileName: string, configuration: EmbeddingConfiguration) {
  const content = await readKnowledgeBaseFile(fileName)
  let index: VectorIndex
  try {
    index = await readIndex()
  } catch (error) {
    if (error instanceof HttpError && error.statusCode === 409) {
      return { ...(await reindexKnowledgeBase(configuration)), incremental: false }
    }
    throw error
  }

  if (
    index.model !== configuration.model ||
    index.baseUrl !== configuration.baseUrl ||
    !(await knowledgeBaseMatchesIndexExcept(index.fileHashes, fileName))
  ) {
    return { ...(await reindexKnowledgeBase(configuration)), incremental: false }
  }

  const pendingChunks = splitIntoChunks(content)
  const chunks: VectorChunk[] = []
  for (let start = 0; start < pendingChunks.length; start += embeddingBatchSize) {
    const batch = pendingChunks.slice(start, start + embeddingBatchSize)
    const vectors = await requestEmbeddings(batch, configuration)
    for (const [index, embedding] of vectors.entries()) {
      chunks.push({ fileName, textContent: batch[index], embedding })
    }
  }

  const existingDimension = index.chunks[0]?.embedding.length
  if (existingDimension !== undefined && chunks.some((chunk) => chunk.embedding.length !== existingDimension)) {
    return { ...(await reindexKnowledgeBase(configuration)), incremental: false }
  }

  const updatedIndex: VectorIndex = {
    ...index,
    updatedAt: new Date().toISOString(),
    fileHashes: { ...index.fileHashes, [fileName]: hashContent(content) },
    chunks: [...index.chunks.filter((chunk) => chunk.fileName !== fileName), ...chunks],
  }
  await writeIndex(updatedIndex)

  return { fileName, chunksIndexed: chunks.length, model: configuration.model, incremental: true }
}

export async function searchKnowledgeBase(
  query: string,
  topK: number,
  configuration: EmbeddingConfiguration,
): Promise<SearchResult[]> {
  const index = await readIndex()
  if (index.model !== configuration.model || index.baseUrl !== configuration.baseUrl) {
    throw new HttpError('The embedding configuration differs from the index. Reindex the knowledge base.', 409)
  }

  if (!(await knowledgeBaseMatchesIndex(index.fileHashes))) {
    throw new HttpError('The knowledge base has changed. Reindex it before searching.', 409)
  }
  if (index.chunks.length === 0) {
    return []
  }

  const [queryEmbedding] = await requestEmbeddings([query], configuration)
  const bestResultByFile = new Map<string, SearchResult>()

  for (const chunk of index.chunks) {
    if (chunk.embedding.length !== queryEmbedding.length) {
      throw new HttpError('Embedding dimensions differ from the index. Reindex the knowledge base.', 409)
    }

    const score = cosineSimilarity(queryEmbedding, chunk.embedding)
    const current = bestResultByFile.get(chunk.fileName)
    if (!current || score > current.score) {
      bestResultByFile.set(chunk.fileName, {
        fileName: chunk.fileName,
        textContent: chunk.textContent,
        score,
      })
    }
  }

  return [...bestResultByFile.values()]
    .sort((left, right) => right.score - left.score || left.fileName.localeCompare(right.fileName))
    .slice(0, topK)
}

async function requestEmbeddings(inputs: string[], configuration: EmbeddingConfiguration): Promise<number[][]> {
  let response: Response
  try {
    response = await fetch(`${configuration.baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${configuration.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ model: configuration.model, input: inputs }),
      signal: AbortSignal.timeout(30_000),
    })
  } catch {
    throw new HttpError('Unable to reach the configured embedding service.', 502)
  }

  if (!response.ok) {
    throw new HttpError(`The embedding service returned HTTP ${response.status}.`, 502)
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    throw new HttpError('The embedding service returned an invalid response.', 502)
  }

  if (typeof body !== 'object' || body === null || !('data' in body) || !Array.isArray(body.data)) {
    throw new HttpError('The embedding service returned an invalid response.', 502)
  }

  const data = body.data as unknown[]
  if (data.length !== inputs.length) {
    throw new HttpError('The embedding service returned an unexpected number of vectors.', 502)
  }

  const ordered = data
    .map((item, fallbackIndex) => {
      if (typeof item !== 'object' || item === null) {
        throw new HttpError('The embedding service returned an invalid vector.', 502)
      }
      const record = item as { index?: unknown; embedding?: unknown }
      return {
        index: Number.isInteger(record.index) ? Number(record.index) : fallbackIndex,
        embedding: record.embedding,
      }
    })
    .sort((left, right) => left.index - right.index)

  const embeddings = ordered.map(({ embedding }) => {
    if (
      !Array.isArray(embedding) ||
      embedding.length === 0 ||
      !embedding.every((value) => typeof value === 'number' && Number.isFinite(value))
    ) {
      throw new HttpError('The embedding service returned an invalid vector.', 502)
    }
    return embedding as number[]
  })

  const dimension = embeddings[0]?.length
  if (dimension === undefined || embeddings.some((embedding) => embedding.length !== dimension)) {
    throw new HttpError('The embedding service returned inconsistent vector dimensions.', 502)
  }

  return embeddings
}

async function knowledgeBaseMatchesIndex(fileHashes: Record<string, string>): Promise<boolean> {
  return knowledgeBaseMatchesIndexExcept(fileHashes, '')
}

async function knowledgeBaseMatchesIndexExcept(
  fileHashes: Record<string, string>,
  excludedFileName: string,
): Promise<boolean> {
  const fileNames = (await listKnowledgeBaseFiles()).filter((fileName) => fileName !== excludedFileName)
  const indexedFileNames = Object.keys(fileHashes).filter((fileName) => fileName !== excludedFileName)
  if (fileNames.length !== indexedFileNames.length) {
    return false
  }

  for (const fileName of fileNames) {
    const content = await readKnowledgeBaseFile(fileName)
    if (fileHashes[fileName] !== hashContent(content)) {
      return false
    }
  }
  return true
}

async function readIndex(): Promise<VectorIndex> {
  let contents: string
  try {
    contents = await readFile(getVectorIndexPath(), 'utf8')
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      throw new HttpError('No vector index found. Reindex the knowledge base first.', 409)
    }
    throw error
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(contents)
  } catch {
    throw new HttpError('The local vector index is invalid. Reindex the knowledge base.', 500)
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new HttpError('The local vector index is invalid. Reindex the knowledge base.', 500)
  }

  const index = parsed as Partial<VectorIndex>
  if (
    index.version !== 1 ||
    typeof index.model !== 'string' ||
    typeof index.baseUrl !== 'string' ||
    typeof index.updatedAt !== 'string' ||
    !isStringRecord(index.fileHashes) ||
    !Array.isArray(index.chunks) ||
    !index.chunks.every(isVectorChunk)
  ) {
    throw new HttpError('The local vector index is invalid. Reindex the knowledge base.', 500)
  }

  return index as VectorIndex
}

async function writeIndex(index: VectorIndex): Promise<void> {
  const indexPath = getVectorIndexPath()
  const temporaryPath = `${indexPath}.${randomUUID()}.tmp`
  await mkdir(dirname(indexPath), { recursive: true })

  try {
    await writeFile(temporaryPath, JSON.stringify(index), 'utf8')
    await rename(temporaryPath, indexPath)
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

function splitIntoChunks(content: string): string[] {
  const text = content.trim()
  if (!text) {
    return []
  }

  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    let end = Math.min(start + chunkSize, text.length)
    if (end < text.length) {
      const lineBreak = text.lastIndexOf('\n', end)
      if (lineBreak > start + chunkSize / 2) {
        end = lineBreak
      }
    }

    const chunk = text.slice(start, end).trim()
    if (chunk) {
      chunks.push(chunk)
    }
    if (end >= text.length) {
      break
    }
    start = Math.max(end - chunkOverlap, start + 1)
  }
  return chunks
}

function normalizeBaseUrl(value: string): string {
  if (value.length > 2048) {
    throw new HttpError('Embedding base URL is too long.', 400)
  }

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new HttpError('A valid embedding base URL is required.', 400)
  }

  if (
    (url.protocol !== 'http:' && url.protocol !== 'https:') ||
    url.username ||
    url.password ||
    url.search ||
    url.hash
  ) {
    throw new HttpError('Embedding base URL must use HTTP or HTTPS without credentials, query, or fragment.', 400)
  }

  let basePath = url.pathname.replace(/\/+$/, '')
  if (basePath.toLowerCase().endsWith('/embeddings')) {
    basePath = basePath.slice(0, -'/embeddings'.length)
  }
  return `${url.origin}${basePath}`
}

function cosineSimilarity(left: number[], right: number[]): number {
  let dotProduct = 0
  let leftMagnitude = 0
  let rightMagnitude = 0
  for (let index = 0; index < left.length; index += 1) {
    dotProduct += left[index] * right[index]
    leftMagnitude += left[index] ** 2
    rightMagnitude += right[index] ** 2
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude)
  return denominator === 0 ? 0 : dotProduct / denominator
}

function hashContent(content: string): string {
  return createHash('sha256').update(content).digest('hex')
}

function getBearerToken(value: string | undefined): string {
  const match = value?.match(/^Bearer\s+(.+)$/i)
  return match?.[1].trim() ?? ''
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === 'string')
  )
}

function isVectorChunk(value: unknown): value is VectorChunk {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const chunk = value as Partial<VectorChunk>
  return (
    typeof chunk.fileName === 'string' &&
    typeof chunk.textContent === 'string' &&
    Array.isArray(chunk.embedding) &&
    chunk.embedding.length > 0 &&
    chunk.embedding.every((item) => typeof item === 'number' && Number.isFinite(item))
  )
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String(error.code)
  }
  return undefined
}
