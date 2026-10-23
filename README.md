# Local Agentic Ticket Assistant

A local ticket-support assistant with a React/Vite frontend and an Express/TypeScript API.

## Development

Use Node.js `22.13.0` or newer. Install dependencies from the repository root, then start both workspaces:

```sh
npm install
npm run dev
```

The frontend runs on Vite's local development port, and the API listens on port `3001` by default. The API health check is available at `/api/health`.

Copy `.env.example` to `.env` in the repository root and configure provider credentials there. The server loads this file directly; API keys are never sent to the browser or saved in browser storage. The Settings dialog can temporarily override provider URLs and model names for the current page session.

```sh
cp .env.example .env
```

Set `LLM_API_KEY` for chat and embeddings. To use separate embedding credentials, set `EMBEDDING_API_KEY`; otherwise the embedding client reuses `LLM_API_KEY` (or `OPENAI_API_KEY`). Optional `LLM_BASE_URL`, `LLM_MODEL`, `EMBEDDING_BASE_URL`, and `EMBEDDING_MODEL` values configure OpenAI-compatible services. `/api/config` returns only whether credentials are configured and the non-secret URL/model values.

## File parser smoke test

Post one or more files in the `files` multipart field to `/api/test-parse`. Supported extensions are `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.docx`, `.pptx`, `.xlsx`, `.pdf`, `.txt`, `.csv`, `.md`, and `.json`. The response contains extracted `textContent` and image data URLs in `imagesBase64`. Uploads are limited to 10 files at 10 MB each.

```sh
curl -F "files=@support-ticket.pdf" http://localhost:3001/api/test-parse
```

## Knowledge base and local search

Markdown files in `knowledge_base/` are available through `GET /api/kb` (list) and `GET /api/kb/:fileName` (read). Create with `POST /api/kb` using `{ "fileName": "topic.md", "content": "..." }`; update with `PUT /api/kb/:fileName` and delete with `DELETE /api/kb/:fileName`.

Build the local vector index with `POST /api/kb/reindex`, then retrieve the top matching file excerpts with `POST /api/kb/search` and a JSON body such as `{ "query": "refund policy", "topK": 5 }`. Reindex after editing files. Vectors are stored in `knowledge_base/.index/embeddings.json`; API keys are never written to the index.

Reindex and search use `EMBEDDING_API_KEY` or fall back to `LLM_API_KEY` / `OPENAI_API_KEY` from the server environment. The embedding endpoint and model can be overridden with `x-embedding-base-url` and `x-embedding-model`; defaults are the OpenAI-compatible `https://api.openai.com/v1` endpoint and `text-embedding-3-small`. The configured embedding service must expose an OpenAI-compatible `/embeddings` endpoint.

```sh
curl -X POST http://localhost:3001/api/kb/reindex
```

## Agent workflows

`POST /api/agents/draft` accepts a JSON body with `message` or multipart fields `message` and `files`. It returns `draftResponse`, `sourcesUsed`, and `knowledgeGaps`. `POST /api/agents/memory` accepts `message` or `gap` plus `answer`, and optional `files`; it creates or updates a Markdown entry and reindexes the changed file. If saving succeeds but reindexing fails, the response reports `indexed: false` and an `indexingError`.

Agent requests use `LLM_API_KEY` (or `OPENAI_API_KEY`) from the server environment for chat and the embedding environment variables described above for retrieval. Optional endpoint/model headers can override non-secret settings. Defaults are `https://api.openai.com/v1` and `gpt-4o-mini`. The frontend includes a multi-file drag-and-drop chat composer, draft and memory modes, Markdown-rendered responses, inline knowledge-gap answers, and a Markdown knowledge-base explorer with CRUD and reindex controls.
