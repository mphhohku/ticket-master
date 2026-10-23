import { extname } from 'node:path'
import { parse as parseCsv } from 'csv-parse/sync'
import { OfficeParser } from 'officeparser'
import { HttpError } from '../errors.js'

const supportedExtensions = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.bmp',
  '.docx',
  '.pptx',
  '.xlsx',
  '.pdf',
  '.txt',
  '.csv',
  '.md',
  '.json',
])

const imageMimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp',
}

const officeExtensions = new Set(['.docx', '.pptx', '.xlsx', '.pdf'])

type UploadedFile = Pick<Express.Multer.File, 'originalname' | 'buffer'>

export interface ParsedFile {
  textContent: string
  imagesBase64: string[]
}

export class FileParserError extends HttpError {
  constructor(message: string, statusCode: 400 | 422) {
    super(message, statusCode)
    this.name = 'FileParserError'
  }
}

export function isSupportedFileName(fileName: string): boolean {
  return supportedExtensions.has(extname(fileName).toLowerCase())
}

export async function parseFile(file: UploadedFile): Promise<ParsedFile> {
  const extension = extname(file.originalname).toLowerCase()
  if (!supportedExtensions.has(extension)) {
    throw new FileParserError('Unsupported file type.', 400)
  }

  const imageMimeType = imageMimeTypes[extension]
  if (imageMimeType) {
    return {
      textContent: '',
      imagesBase64: [`data:${imageMimeType};base64,${file.buffer.toString('base64')}`],
    }
  }

  if (extension === '.txt' || extension === '.md') {
    return { textContent: decodeText(file.buffer), imagesBase64: [] }
  }

  if (extension === '.csv') {
    try {
      parseCsv(file.buffer, { bom: true, skip_empty_lines: true })
    } catch {
      throw new FileParserError('Unable to parse CSV file.', 422)
    }
    return { textContent: decodeText(file.buffer), imagesBase64: [] }
  }

  if (extension === '.json') {
    const textContent = decodeText(file.buffer)
    try {
      JSON.parse(textContent)
    } catch {
      throw new FileParserError('Unable to parse JSON file.', 422)
    }
    return { textContent, imagesBase64: [] }
  }

  if (officeExtensions.has(extension)) {
    try {
      const document = await OfficeParser.parseOffice(file.buffer)
      const { value } = await document.to('text')
      return { textContent: value, imagesBase64: [] }
    } catch {
      throw new FileParserError('Unable to extract text from the uploaded document.', 422)
    }
  }

  throw new FileParserError('Unsupported file type.', 400)
}

function decodeText(buffer: Buffer): string {
  return buffer.toString('utf8').replace(/^\uFEFF/, '')
}
