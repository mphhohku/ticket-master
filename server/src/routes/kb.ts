import { Router } from 'express'
import { HttpError } from '../errors.js'
import {
  createKnowledgeBaseFile,
  deleteKnowledgeBaseFile,
  listKnowledgeBaseFiles,
  readKnowledgeBaseFile,
  updateKnowledgeBaseFile,
} from '../services/knowledgeBaseService.js'
import {
  getEmbeddingConfiguration,
  reindexKnowledgeBase,
  searchKnowledgeBase,
} from '../services/vectorStore.js'

const router = Router()

router.get('/', async (_request, response) => {
  response.json({ files: await listKnowledgeBaseFiles() })
})

router.get('/:fileName', async (request, response) => {
  const content = await readKnowledgeBaseFile(request.params.fileName)
  response.json({ fileName: request.params.fileName, content })
})

router.post('/reindex', async (request, response) => {
  const configuration = getEmbeddingConfiguration(request)
  response.json(await reindexKnowledgeBase(configuration))
})

router.post('/search', async (request, response) => {
  const body = getRequestBody(request.body)
  if (typeof body.query !== 'string' || body.query.trim().length === 0) {
    throw new HttpError('A non-empty search query is required.', 400)
  }

  const topK = body.topK ?? 5
  if (typeof topK !== 'number' || !Number.isInteger(topK) || topK < 1 || topK > 20) {
    throw new HttpError('topK must be an integer between 1 and 20.', 400)
  }

  const configuration = getEmbeddingConfiguration(request)
  const results = await searchKnowledgeBase(body.query.trim(), topK, configuration)
  response.json({ results })
})

router.post('/', async (request, response) => {
  const body = getRequestBody(request.body)
  if (typeof body.fileName !== 'string' || typeof body.content !== 'string') {
    throw new HttpError('fileName and content strings are required.', 400)
  }

  await createKnowledgeBaseFile(body.fileName, body.content)
  response.status(201).json({ fileName: body.fileName, content: body.content })
})

router.put('/:fileName', async (request, response) => {
  const body = getRequestBody(request.body)
  if (typeof body.content !== 'string') {
    throw new HttpError('A content string is required.', 400)
  }

  await updateKnowledgeBaseFile(request.params.fileName, body.content)
  response.json({ fileName: request.params.fileName, content: body.content })
})

router.delete('/:fileName', async (request, response) => {
  await deleteKnowledgeBaseFile(request.params.fileName)
  response.json({ deleted: request.params.fileName })
})

function getRequestBody(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new HttpError('A JSON object request body is required.', 400)
  }
  return value as Record<string, unknown>
}

export default router
