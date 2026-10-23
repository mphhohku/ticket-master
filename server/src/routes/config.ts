import { Router } from 'express'
import { getPublicLlmConfiguration } from '../services/llmService.js'
import { getPublicEmbeddingConfiguration } from '../services/vectorStore.js'

const router = Router()

router.get('/', (_request, response) => {
  response.set('Cache-Control', 'no-store')
  response.json({
    llm: getPublicLlmConfiguration(),
    embeddings: getPublicEmbeddingConfiguration(),
  })
})

export default router
