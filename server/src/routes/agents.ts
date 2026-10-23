import { Router } from 'express'
import multer from 'multer'
import { consolidateMemory } from '../agents/memoryAgent.js'
import { draftTicketReply, type AgentAttachment } from '../agents/drafterAgent.js'
import { HttpError } from '../errors.js'
import { parseFile, isSupportedFileName } from '../services/fileParser.js'
import { getLlmConfiguration } from '../services/llmService.js'
import { getEmbeddingConfiguration } from '../services/vectorStore.js'

const maxFileCount = 10
const maxMessageCharacters = 30_000
const maxAttachmentTextCharacters = 100_000
const maxImageDataUrlCharacters = 16_000_000

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: maxFileCount,
  },
  fileFilter(_request, file, callback) {
    if (!isSupportedFileName(file.originalname)) {
      callback(new HttpError('Unsupported file type.', 400))
      return
    }
    callback(null, true)
  },
})

const router = Router()

router.post('/draft', upload.array('files', maxFileCount), async (request, response) => {
  const files = Array.isArray(request.files) ? request.files : []
  const attachments = await parseAttachments(files)
  const message = getOptionalText(request.body?.message)
  validateAgentInput(message, attachments)

  const llmConfiguration = getLlmConfiguration(request)
  const embeddingConfiguration = getEmbeddingConfiguration(request)
  const result = await draftTicketReply(message, attachments, llmConfiguration, embeddingConfiguration)
  response.json(result)
})

router.post('/memory', upload.array('files', maxFileCount), async (request, response) => {
  const files = Array.isArray(request.files) ? request.files : []
  const attachments = await parseAttachments(files)
  const message = [
    getOptionalText(request.body?.message),
    getOptionalText(request.body?.gap) && `Knowledge gap: ${getOptionalText(request.body?.gap)}`,
    getOptionalText(request.body?.answer) && `User-provided answer: ${getOptionalText(request.body?.answer)}`,
  ].filter(Boolean).join('\n')
  validateAgentInput(message, attachments)

  const llmConfiguration = getLlmConfiguration(request)
  const embeddingConfiguration = getEmbeddingConfiguration(request)
  const result = await consolidateMemory(message, attachments, llmConfiguration, embeddingConfiguration)
  response.json(result)
})

async function parseAttachments(files: Express.Multer.File[]): Promise<AgentAttachment[]> {
  const attachments: AgentAttachment[] = []
  let textCharacters = 0
  let imageCharacters = 0

  for (const file of files) {
    const parsed = await parseFile(file)
    textCharacters += parsed.textContent.length
    imageCharacters += parsed.imagesBase64.reduce((total, image) => total + image.length, 0)
    if (textCharacters > maxAttachmentTextCharacters) {
      throw new HttpError('Extracted attachment text exceeds the request limit.', 413)
    }
    if (imageCharacters > maxImageDataUrlCharacters) {
      throw new HttpError('Attached image data exceeds the request limit.', 413)
    }
    attachments.push({ fileName: file.originalname, ...parsed })
  }
  return attachments
}

function getOptionalText(value: unknown): string {
  if (typeof value !== 'string') {
    return ''
  }
  return value.trim()
}

function validateAgentInput(message: string, attachments: AgentAttachment[]): void {
  if (!message && attachments.length === 0) {
    throw new HttpError('Provide a message or at least one file.', 400)
  }
  if (message.length > maxMessageCharacters) {
    throw new HttpError('The message exceeds the request limit.', 413)
  }
}

export default router
