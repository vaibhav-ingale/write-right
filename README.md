# Write Right (Chrome Extension + Local Backend)

Local AI writing assistant that refines text directly in webpages using a Chrome extension and a local FastAPI backend.

## What it does
- Press `\` while focused in an editable field (input, textarea, contenteditable) to open the refiner UI.
- Pick a refinement mode (Formal, Clarity, Concise, Grammar, etc.).
- Send text to the local backend, which forwards the request to your local LLM endpoint (for example Ollama).
- Apply the refined result back into the original field.

## Project structure
- `write-right-extension/` - Chrome extension source (manifest, content script, popup).
- `backend/` - FastAPI backend that proxies requests to an OpenAI-compatible LLM endpoint.
- `test-inputs.html` - local page with editable controls for extension testing.

## Prerequisites
- Python 3.10+
- Ollama installed and running (`ollama serve`)
- `gemma3:4b` model pulled locally:

```bash
ollama pull gemma3:4b
```

## Setup

### 1) Start the backend

From this repo root:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

Backend env vars are documented in `backend/README.md`.

### 2) Load the extension in Chrome

1. Open `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `write-right-extension/` folder

### 3) Use it

1. Focus any editable field on a page
2. Press `\` to open the refiner
3. Choose a mode and click **Apply Result**

## Notes
- Default backend endpoint in the extension is `http://localhost:8000`.
- The request target used by the extension is `/v1/chat/completions`.
- You can test locally with `test-inputs.html`.
