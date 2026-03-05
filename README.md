# AI Text Refiner (Chrome Extension + Local Backend)

## _Create a fast, privacy-first AI writing assistant that works everywhere on the web without sending data to the cloud._

This repository contains a **Chrome Extension** and a **local backend service** that work together to provide an on-page text refinement experience using a local LLM (via Ollama).

## What it does
- Press `\` while focused inside any editable element (input/textarea/contenteditable) to open the refinement UI.
- Choose a refinement mode (Formal, Clarity, Concise, etc.) to send your text to a local API.
- The backend forwards the request to a local Ollama instance and returns the refined text.
- Click **Apply Result** to replace the original text.

## Structure
- `ai-text-refiner-extension/` – Chrome Extension code (manifest, content script, popup UI)
- `backend/` – Node/Express local API that proxies to Ollama
- `project.md` – design notes and feature requirements

## Setup

### 1) Start the backend

```bash
cd backend
npm install
npm start
```

The backend starts on `http://localhost:8000` and forwards requests to Ollama at `http://127.0.0.1:11434` by default.

You can override the Ollama API URL with:

```bash
OLLAMA_URL=http://127.0.0.1:11434/v1/chat/completions npm start
```

### 2) Load the Chrome Extension (Dev Mode)

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `ai-text-refiner-extension/` folder in this repo

### 3) Use it

1. Focus a textbox on any webpage (input, textarea, or contenteditable block)
2. Press `\` (backslash)
3. The refinement UI will appear; choose a mode and click **Apply Result**

---

## Notes
- The extension uses `http://localhost:8000/v1/chat/completions` by default.
- The backend uses a simple prompt template per refinement task (see `backend/index.js`).
- The backend is intentionally lightweight; it simply proxies to the configured Ollama endpoint.
