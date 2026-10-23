import { config as loadEnv } from 'dotenv'
import express, { type ErrorRequestHandler } from 'express'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import multer from 'multer'
import { HttpError } from './errors.js'
import agentsRouter from './routes/agents.js'
import configRouter from './routes/config.js'
import kbRouter from './routes/kb.js'
import testParseRouter from './routes/testParse.js'

loadEnv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../.env') })

const app = express()
const port = Number(process.env.PORT ?? 3001)

app.use(express.json({ limit: '5mb' }))

app.get('/api/health', (_request, response) => {
  response.json({ status: 'ok' })
})

app.use('/api/config', configRouter)
app.use('/api', testParseRouter)
app.use('/api/agents', agentsRouter)
app.use('/api/kb', kbRouter)

const uploadErrorHandler: ErrorRequestHandler = (error, _request, response, _next) => {
  if (error instanceof multer.MulterError) {
    const statusCode = error.code === 'LIMIT_FILE_SIZE' ? 413 : 400
    response.status(statusCode).json({ error: error.message })
    return
  }

  if (error instanceof HttpError) {
    response.status(error.statusCode).json({ error: error.message })
    return
  }

  if (isBodyParserError(error)) {
    const statusCode = error.type === 'entity.too.large' ? 413 : 400
    const message = statusCode === 413 ? 'Request body is too large.' : 'Invalid JSON request body.'
    response.status(statusCode).json({ error: message })
    return
  }

  response.status(500).json({ error: 'An unexpected API error occurred.' })
}

app.use(uploadErrorHandler)

function isBodyParserError(error: unknown): error is { type: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    (error.type === 'entity.too.large' || error.type === 'entity.parse.failed')
  )
}

app.listen(port, () => {
  console.log(`Ticket Assistant API listening on http://localhost:${port}`)
})
