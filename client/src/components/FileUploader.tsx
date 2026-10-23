import { useCallback } from 'react'
import { useDropzone, type Accept } from 'react-dropzone'
import { FileText, Image, Paperclip, X } from 'lucide-react'

const acceptedFiles: Accept = {
  'image/*': ['.png', '.jpg', '.jpeg', '.gif', '.bmp'],
  'application/pdf': ['.pdf'],
  'text/plain': ['.txt', '.md'],
  'text/csv': ['.csv'],
  'application/json': ['.json'],
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': ['.pptx'],
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
}

interface FileUploaderProps {
  files: File[]
  onChange: (files: File[]) => void
  disabled?: boolean
}

export function FileUploader({ files, onChange, disabled = false }: FileUploaderProps) {
  const onDrop = useCallback((accepted: File[]) => {
    onChange([...files, ...accepted].slice(0, 10))
  }, [files, onChange])
  const { getRootProps, getInputProps, isDragActive, fileRejections } = useDropzone({
    onDrop,
    accept: acceptedFiles,
    maxSize: 10 * 1024 * 1024,
    maxFiles: Math.max(1, 10 - files.length),
    disabled: disabled || files.length >= 10,
  })

  return (
    <div className="upload-area">
      <div {...getRootProps({ className: `dropzone ${isDragActive ? 'is-dragging' : ''} ${disabled ? 'is-disabled' : ''}` })}>
        <input {...getInputProps()} aria-label="Attach files" />
        <Paperclip size={15} />
        <span>{isDragActive ? 'Drop files to attach' : 'Attach files or drop them here'}</span>
        <span className="upload-hint">Up to 10 files · 10 MB each</span>
      </div>
      {files.length > 0 ? (
        <div className="file-previews">
          {files.map((file, index) => (
            <div className="file-preview" key={`${file.name}-${file.lastModified}-${index}`}>
              {file.type.startsWith('image/') ? <Image size={15} /> : <FileText size={15} />}
              <span title={file.name}>{file.name}</span>
              <button type="button" className="remove-file" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((_, fileIndex) => fileIndex !== index))}>
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      ) : null}
      {fileRejections.length > 0 ? <p className="upload-error">Unsupported file or file exceeds 10 MB. Supported: images, PDF, DOCX, PPTX, XLSX, TXT, CSV, MD, JSON.</p> : null}
    </div>
  )
}
