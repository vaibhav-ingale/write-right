"""
WriteRight Backend - FastAPI Implementation
API for AI-powered text refinement using Ollama/LLM Gateway.
"""

import os
import time
from typing import Optional, List, Dict, Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, ConfigDict

load_dotenv()

app = FastAPI(
    title="WriteRight API",
    description="AI-powered text refinement service",
    version="1.0.0"
)

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configuration (defaulting to ollama)
LLM_BASE_URL = os.getenv("LLM_BASE_URL", "http://127.0.0.1:11434")
LLM_URL = os.getenv("LLM_URL", f"{LLM_BASE_URL}/v1/chat/completions")
LLM_API_KEY = os.getenv("LLM_API_KEY", "not-needed")
PORT = int(os.getenv("PORT", "8000"))

# Prints selected .env variables for debug (masks secrets)
def log_env_vars():
    masked_api_key = None
    if LLM_API_KEY:
        masked_api_key = "***" + LLM_API_KEY[-4:]

    env_vars = {
        "LLM_BASE_URL": LLM_BASE_URL,
        "LLM_URL": LLM_URL,
        "PORT": PORT,
        "LLM_API_KEY": masked_api_key,
    }

    print("Loaded environment configuration:")
    for name, value in env_vars.items():
        print(f"  {name}={value}")
    print()


# HTTP client with timeout configuration
http_client = httpx.AsyncClient(timeout=60.0)

# System prompt for text refinement
SYSTEM_PROMPT = """You are a professional writing assistant that refines and improves text.

Core Instructions:
- Return ONLY the refined text with no preamble, explanations, or meta-commentary
- Preserve the original meaning and intent unless instructed otherwise
- Do not use emojis or contractions (e.g., use "do not" instead of "don't")
- Follow markdown formatting only if the input uses it; otherwise, use plain text
- Apply any additional constraints (word limit) specified in the user message"""

# Task-specific refinement instructions
REFINE_TASKS = {
    "formal": "Rewrite this text in a formal, professional tone.",
    "clarity": "Improve the clarity and readability of this text.",
    "concise": "Make this text shorter and more concise while preserving key points.",
    "elaborate": "Expand this text with additional detail and explanation.",
    "grammar": "Correct all grammar, spelling, and punctuation errors.",
    "simplify": "Simplify this text using clearer language and structure.",
    "tone": "Adjust this text to a professional and positive tone."
}


# Pydantic models for request/response validation
class Message(BaseModel):
    role: str
    content: str


class ChatCompletionRequest(BaseModel):
    model: Optional[str] = "gemma3:4b"
    messages: Optional[List[Message]] = None
    refinement: Optional[str] = None
    text: Optional[str] = None
    maxWords: Optional[int] = Field(None, alias="maxWords")
    temperature: Optional[float] = 0.5

    model_config = ConfigDict(populate_by_name=True)


def build_LLM_request(body: ChatCompletionRequest) -> Dict[str, Any]:
    """
    Build LLM request payload from ChatCompletionRequest.
    Supports both direct messages and structured refinement requests.
    """
    model = body.model or "llama3"
    temperature = body.temperature if body.temperature is not None else 0.5

    # If messages are provided directly, use them
    if body.messages:
        return {
            "model": model,
            "messages": [msg.model_dump() for msg in body.messages],
            "temperature": temperature
        }

    # Build structured refinement request
    task = (body.refinement or "clarity").lower()
    text = (body.text or "").strip()
    task_instruction = REFINE_TASKS.get(task, REFINE_TASKS["clarity"])

    # Build constraints list
    constraints = []
    if body.maxWords:
        constraints.append(f"Word limit: {body.maxWords} words maximum")

    # Construct user message
    constraints_section = ""
    if constraints:
        constraints_section = "\n\nConstraints:\n" + "\n".join(f"- {c}" for c in constraints)

    user_content = f"{task_instruction}{constraints_section}\n\nText to refine:\n{text}"

    return {
        "model": model,
        "messages": [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_content}
        ],
        "temperature": temperature
    }


@app.post("/v1/chat/completions")
async def chat_completions(request: ChatCompletionRequest):
    """
    OpenAI-compatible chat completions endpoint.
    Forwards requests to Ollama/LLM Gateway with text refinement capabilities.
    """
    payload = build_LLM_request(request)

    # Prepare headers
    headers = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"
    headers["X-Session-ID"] = f"write-right-{int(time.time() * 1000)}"

    try:
        response = await http_client.post(
            LLM_URL,
            json=payload,
            headers=headers
        )

        data = response.json()

        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=data)

        return data

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Failed to contact local LLM instance.",
                "details": str(exc)
            }
        )


@app.get("/v1/models")
async def list_models():
    """
    List available models from LLM.
    Returns a simplified list of model IDs.
    """
    headers = {"Content-Type": "application/json"}
    if LLM_API_KEY:
        headers["Authorization"] = f"Bearer {LLM_API_KEY}"
    headers["X-Session-ID"] = f"write-right-{int(time.time() * 1000)}"

    try:
        response = await http_client.get(
            f"{LLM_BASE_URL}/v1/models",
            headers=headers
        )

        data = response.json()

        if not response.is_success:
            raise HTTPException(status_code=response.status_code, detail=data)

        # Extract model IDs from response
        models = []
        if isinstance(data.get("data"), list):
            models = [m.get("id") for m in data["data"] if m.get("id")]

        return {"models": models}

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "error": "Failed to fetch model list from LLM.",
                "details": str(exc)
            }
        )


@app.get("/health")
async def health_check():
    """
    Health check endpoint.
    Verifies connectivity to LLM and returns system status.
    """
    test_payload = {
        "model": "llama3",
        "messages": [
            {"role": "system", "content": "You are a helpful assistant. Respond concisely."},
            {"role": "user", "content": "Reply with only the word: OK"}
        ]
    }

    try:
        response = await http_client.post(
            LLM_URL,
            json=test_payload,
            headers={"Content-Type": "application/json"}
        )

        data = response.json()
        is_ok = response.is_success and isinstance(data.get("choices"), list)

        result = None
        if is_ok and data["choices"]:
            result = data["choices"][0].get("message", {}).get("content")

        return {
            "status": "ok" if is_ok else "error",
            "backend": "writeright-fastapi",
            "LLMUrl": LLM_URL,
            "LLM": {
                "reachable": response.is_success,
                "result": result if response.is_success else None,
                "raw": None if response.is_success else data
            }
        }

    except httpx.RequestError as exc:
        raise HTTPException(
            status_code=502,
            detail={
                "status": "error",
                "backend": "writeright-fastapi",
                "LLMUrl": LLM_URL,
                "error": "Failed to contact local LLM instance.",
                "details": str(exc)
            }
        )


@app.get("/")
async def root():
    """Root endpoint with API information."""
    return {
        "name": "WriteRight API",
        "version": "1.0.0",
        "endpoints": {
            "chat": "/v1/chat/completions",
            "models": "/v1/models",
            "health": "/health",
            "docs": "/docs"
        }
    }


if __name__ == "__main__":
    import uvicorn

    # Debug: print selected environment variables
    log_env_vars()

    print(f"WriteRight backend listening on http://localhost:{PORT}")
    print(f"Forwarding to LLM at {LLM_URL}")
    print(f"API documentation available at http://localhost:{PORT}/docs")
    uvicorn.run(app, host="0.0.0.0", port=PORT)
