import { Router } from 'express'
import multer from 'multer'
import { FileParserError, isSupportedFileName, parseFile } from '../services/fileParser.js'

const maxFileCount = 10
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: maxFileCount,
  },
  fileFilter(_request, file, callback) {
    if (!isSupportedFileName(file.originalname)) {
      callback(new FileParserError('Unsupported file type.', 400))
      return
    }
    callback(null, true)
  },
})

const router = Router()

router.post('/test-parse', upload.array('files', maxFileCount), async (request, response) => {
  const files = Array.isArray(request.files) ? request.files : []
  if (files.length === 0) {
    response.status(400).json({ error: 'Upload at least one file using the "files" field.' })
    return
  }

  const parsedFiles = []
  for (const file of files) {
    parsedFiles.push({
      fileName: file.originalname,
      ...await parseFile(file),
    })
  }

  response.json({ files: parsedFiles })
})

export default router
