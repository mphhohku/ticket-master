Here is a comprehensive, structured Project Specification and Plan designed specifically to be fed into an agentic coding assistant (like Cursor, Windsurf, Cline, or GitHub Copilot). 

You can copy and paste the markdown below directly into a `PROMPT.md` or `SPEC.md` file in your workspace and instruct your coding agent to execute it phase by phase.

***

# Project Specification: Local Agentic Ticket Assistant

## 1. Project Overview
Build a local-only, full-stack application (Node.js/TypeScript backend + React/Vite/TypeScript frontend) designed to help answer support tickets using a local knowledge base of Markdown (`.md`) files. 

The system uses a Bring-Your-Own-Key (BYOK) LLM setup (OpenAI/Anthropic/GitHub Models compatible) to power two primary **Agentic Workflows**:
1. **Response Drafting & Gap Identification:** Drafts ticket responses based on local `.md` memories and explicitly flags missing information (knowledge gaps) for the user to fill.
2. **Knowledge Base (Memory) Updater:** Takes newly resolved tickets or user-provided gap-fills and creates/updates the local `.md` files to improve future responses.

## 2. Tech Stack & Architecture
* **Architecture:** Monorepo (using npm/pnpm workspaces) running locally.
* **Frontend (`/client`):** React 18, Vite, TypeScript, TailwindCSS, `lucide-react` (icons), `react-dropzone` (file uploads), `react-markdown` (rendering).
* **Backend (`/server`):** Node.js, Express, TypeScript, `multer` (file handling).
* **AI & RAG (Local):** 
  * `@langchain/core`, `@langchain/openai` (or standard OpenAI/GitHub Copilot SDK configured for BYOK).
  * Local Vector Store: `vectra` or `hnswlib-node` (stores embeddings locally on disk so no external DB is required).
* **File Parsing Libraries:**
  * Images (`.png`, `.jpeg`, `.gif`, `.bmp`): Base64 encoding (passed to Multimodal LLM) or `tesseract.js` for local OCR fallback.
  * Documents (`.docx`, `.pptx`, `.xlsx`, `.pdf`): `officeparser` (handles docx, pptx, xlsx, pdf) or a combination of `mammoth`, `pdf-parse`, and `xlsx`.
  * Text/Data (`.txt`, `.csv`, `.md`, `.json`): Native Node `fs` + `csv-parse`.
* **Storage:** A local directory (`/knowledge_base`) containing `.md` files and a hidden `.index` folder for local vector embeddings.

## 3. Core Features & Agentic Workflows

### 3.1. Multi-Format File Ingestion Engine
When a user uploads files in the chat (representing a new ticket/enquiry or new knowledge):
* The backend intercepts the files via `multer`.
* A unified `FileParserService` extracts raw text from `.docx`, `.pptx`, `.xlsx`, `.pdf`, `.txt`, `.csv`, `.md`, and `.json`.
* Images (`.png`, `.jpeg`, `.gif`, `.bmp`) are converted to base64 data URLs to be passed directly to the Vision-capable LLM.

### 3.2. Agent 1: The Support Drafter & Gap Analyzer
**Trigger:** User submits a chat message + optional file attachments asking how to reply to a ticket.
**Procedure:**
1. Parse any attached files and combine with the user's prompt.
2. Query the local Vector Store to retrieve the top $K$ relevant `.md` files from `/knowledge_base`.
3. **LLM Prompting:** Instruct the agent to:
   * Draft a polite, accurate response based *strictly* on the retrieved `.md` files.
   * Analyze if the ticket asks questions not covered by the retrieved `.md` files.
4. **Output Structure (JSON/Structured Output):**
   * `draftResponse`: The suggested reply to the client.
   * `sourcesUsed`: Array of `.md` filenames used.
   * `knowledgeGaps`: Array of specific questions/topics where information is missing. (If none, return empty array).

### 3.3. Agent 2: The Memory Consolidator (Knowledge Updater)
**Trigger:** User provides the missing information for a flagged "Knowledge Gap", OR explicitly tells the bot: *"Save this resolution to memory."*
**Procedure:**
1. Analyze the new information provided by the user and existing relevant `.md` files.
2. Decide whether to **update** an existing `.md` file or **create** a new `.md` file in `/knowledge_base`.
3. Generate the updated/new Markdown content (using clear headings, tags, and Q&A formatting).
4. Write the file to the `/knowledge_base` directory using Node `fs`.
5. Trigger a re-index of that specific file in the local Vector Store.

## 4. User Interface (UI) Design
* **Left Sidebar:** 
  * Settings modal trigger (to input BYOK API Key, Base URL, and Model Name—stored in `localStorage` and passed via headers to backend).
  * Knowledge Base Explorer: A list of current `.md` files in `/knowledge_base` with a button to view/edit them raw, and a "Re-index All" button.
* **Main Chat Area:**
  * Standard chat interface supporting Markdown rendering.
  * **Special UI Card for Agent 1 Output:** Clearly separates the "Drafted Response" (with a 1-click Copy button) from a yellow warning box showing "Identified Knowledge Gaps".
  * **Quick-Fill Action:** Inside the "Knowledge Gaps" warning box, provide an input field where the user can type the missing answer and click *"Update Knowledge Base"* (which triggers Agent 2).
* **Chat Input Bar:**
  * Textarea for prompt.
  * Drag-and-drop zone / Attachment button supporting `.png, .jpeg, .gif, .bmp, .docx, .pptx, .xlsx, .pdf, .txt, .csv, .md, .json`.
  * Mode selector toggle: `[Mode: Draft Ticket Reply]` vs `[Mode: Direct Memory Ingest]`.

## 5. Directory Structure
```text
/ticket-assistant
├── package.json                 # Workspace root
├── /knowledge_base              # Local .md files live here
│   └── example-faq.md
├── /server                      # Node.js + Express + TS
│   ├── src/
│   │   ├── index.ts             # Entry point
│   │   ├── routes/              # API routes (/chat, /kb, /upload)
│   │   ├── services/
│   │   │   ├── fileParser.ts    # Handles pdf, docx, xlsx, images, etc.
│   │   │   ├── vectorStore.ts   # Local embedding & retrieval of .md files
│   │   │   └── llmService.ts    # BYOK LLM / Copilot SDK wrapper
│   │   └── agents/
│   │       ├── drafterAgent.ts  # Agent 1 logic
│   │       └── memoryAgent.ts   # Agent 2 logic
│   └── tsconfig.json
└── /client                      # React + Vite + TS + Tailwind
    ├── src/
    │   ├── components/
    │   │   ├── ChatWindow.tsx
    │   │   ├── FileUploader.tsx
    │   │   ├── GapFillCard.tsx  # UI for filling knowledge gaps
    │   │   ├── KBExplorer.tsx   # View local .md files
    │   │   └── SettingsModal.tsx# BYOK configuration
    │   ├── App.tsx
    │   └── main.tsx
    └── tsconfig.json
```

## 6. Step-by-Step Implementation Plan (For Coding Agent)

** instructions for the AI Coding Agent: Please implement this project phase by phase. Wait for my confirmation after completing each phase before moving to the next.**

* **Phase 1: Project Scaffolding & Configuration**
  * Initialize the monorepo with `/client` (Vite React TS Tailwind) and `/server` (Express TS).
  * Set up concurrently in the root `package.json` to run both servers with `npm run dev`.
  * Create the `/knowledge_base` directory with one sample `.md` file.
* **Phase 2: Multi-File Parser Service (Backend)**
  * Install `multer`, `officeparser`, `csv-parse`, and standard types.
  * Implement `fileParser.ts` to accept any of the 13 allowed file extensions and return a unified `{ textContent: string, imagesBase64: string[] }` object.
  * Create a test endpoint `/api/test-parse` to verify file extraction.
* **Phase 3: Local Knowledge Base & Vector Store (Backend)**
  * Implement file-system watchers or manual triggers to read `.md` files from `/knowledge_base`.
  * Implement local RAG using `vectra` (or `hnswlib-node` / simple cosine similarity over local JSON embeddings) using the BYOK API key for embeddings.
  * Build CRUD endpoints `/api/kb` to list and read local `.md` files.
* **Phase 4: Agentic Workflows (Backend)**
  * Implement the LLM client wrapper that accepts the BYOK API key/endpoint from request headers.
  * Build `drafterAgent.ts` (Agent 1) using structured JSON outputs to return `{ draftResponse, sourcesUsed, knowledgeGaps }`.
  * Build `memoryAgent.ts` (Agent 2) that takes gap answers or raw files, generates Markdown, saves/updates `/knowledge_base/*.md`, and updates the vector index.
* **Phase 5: Frontend UI & Integration**
  * Build the Settings Modal to save BYOK credentials in `localStorage`.
  * Build the Chat interface with multi-file drag-and-drop preview.
  * Build the specialized `GapFillCard` component that renders when `knowledgeGaps.length > 0`, allowing seamless invocation of Agent 2.
  * Connect the Sidebar Knowledge Base explorer to the `/api/kb` endpoints.

***

### 💡 Tips Before You Hand This Off to Your Coding Agent:
1. **About the "BYOK GitHub Copilot SDK"**: If you are using the `@octokit` / Copilot Extensions SDK, or if you are routing through the **GitHub Models API** (`https://models.inference.ai.azure.com`), Note that the GitHub Models API is 100% compatible with the standard **OpenAI Node SDK** (`openai` npm package)—you just change the `baseURL` and pass your GitHub PAT (Personal Access Token) as the `apiKey`. Tell your coding agent to use the standard `openai` SDK with a customizable `baseURL` in the UI settings for maximum flexibility!
2. **Start Small:** Paste the spec above into your agent, and prompt: *"Read this specification. Let's start by executing Phase 1 only."* This prevents the agent from getting overwhelmed and hallucinating broken dependencies.