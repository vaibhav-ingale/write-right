# Backend (FastAPI)

Minimal setup and run guide for the WriteRight backend.

## Prerequisites

- Python 3.10+
- Ollama installed and running (`ollama serve`)
- Pull the default model used by this backend:

```bash
ollama pull gemma3:4b
```

## Setup

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Environment

Create `backend/.env`:

```env
LLM_BASE_URL=http://127.0.0.1:11434
LLM_URL=http://127.0.0.1:11434/v1/chat/completions
LLM_API_KEY=not-needed
PORT=8000
```

## Start Server

```bash
cd backend
source .venv/bin/activate
uvicorn main:app --host 0.0.0.0 --port 8000 --reload
```

## Quick Check

```bash
curl http://127.0.0.1:8000/health
```

If running correctly:
- API docs: `http://127.0.0.1:8000/docs`
- Models endpoint: `http://127.0.0.1:8000/v1/models`
