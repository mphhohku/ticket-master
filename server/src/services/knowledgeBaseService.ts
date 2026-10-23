import { randomUUID } from 'node:crypto'
import { lstat, mkdir, readdir, readFile, rename, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { HttpError } from '../errors.js'

const defaultKnowledgeBaseDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../../../knowledge_base')

export function getKnowledgeBaseDirectory(): string {
  return resolve(process.env.KNOWLEDGE_BASE_DIR?.trim() || defaultKnowledgeBaseDirectory)
}

export function getVectorIndexPath(): string {
  return join(getKnowledgeBaseDirectory(), '.index', 'embeddings.json')
}

export async function listKnowledgeBaseFiles(): Promise<string[]> {
  const directory = getKnowledgeBaseDirectory()
  await mkdir(directory, { recursive: true })
  const entries = await readdir(directory, { withFileTypes: true })

  return entries
    .filter((entry) => entry.isFile() && extname(entry.name).toLowerCase() === '.md')
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right))
}

export async function readKnowledgeBaseFile(fileName: string): Promise<string> {
  const filePath = getMarkdownFilePath(fileName)
  await assertRegularMarkdownFile(filePath)

  try {
    return await readFile(filePath, 'utf8')
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      throw new HttpError('Knowledge-base file not found.', 404)
    }
    throw error
  }
}

export async function createKnowledgeBaseFile(fileName: string, content: string): Promise<void> {
  const filePath = getMarkdownFilePath(fileName)
  await mkdir(getKnowledgeBaseDirectory(), { recursive: true })

  try {
    await writeFile(filePath, content, { encoding: 'utf8', flag: 'wx' })
  } catch (error) {
    if (getErrorCode(error) === 'EEXIST') {
      throw new HttpError('Knowledge-base file already exists.', 409)
    }
    throw error
  }
}

export async function updateKnowledgeBaseFile(fileName: string, content: string): Promise<void> {
  const filePath = getMarkdownFilePath(fileName)
  await assertRegularMarkdownFile(filePath)

  const temporaryPath = join(
    getKnowledgeBaseDirectory(),
    `.${basename(fileName)}.${randomUUID()}.tmp`,
  )

  try {
    await writeFile(temporaryPath, content, 'utf8')
    await rename(temporaryPath, filePath)
  } finally {
    await unlink(temporaryPath).catch(() => undefined)
  }
}

export async function deleteKnowledgeBaseFile(fileName: string): Promise<void> {
  const filePath = getMarkdownFilePath(fileName)
  await assertRegularMarkdownFile(filePath)

  try {
    await unlink(filePath)
  } catch (error) {
    if (getErrorCode(error) === 'ENOENT') {
      throw new HttpError('Knowledge-base file not found.', 404)
    }
    throw error
  }
}

function getMarkdownFilePath(fileName: string): string {
  if (
    fileName.length === 0 ||
    fileName !== basename(fileName) ||
    fileName.includes('\\') ||
    fileName.includes('\0') ||
    fileName === '.' ||
    fileName === '..' ||
    extname(fileName).toLowerCase() !== '.md'
  ) {
    throw new HttpError('A plain .md filename is required.', 400)
  }

  return join(getKnowledgeBaseDirectory(), fileName)
}

async function assertRegularMarkdownFile(filePath: string): Promise<void> {
  try {
    const fileInfo = await lstat(filePath)
    if (!fileInfo.isFile()) {
      throw new HttpError('Knowledge-base file not found.', 404)
    }
  } catch (error) {
    if (error instanceof HttpError) {
      throw error
    }
    if (getErrorCode(error) === 'ENOENT') {
      throw new HttpError('Knowledge-base file not found.', 404)
    }
    throw error
  }
}

function getErrorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String(error.code)
  }
  return undefined
}
