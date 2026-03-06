import dotenv from "dotenv";
import express from "express";
import cors from "cors";

dotenv.config();

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 8000;

// Ollama base URL (for tags/model list) and the chat completions endpoint.
const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434";
const ollamaUrl = process.env.OLLAMA_URL || `${ollamaBaseUrl}/v1/chat/completions`;
const ollamaApiKey = process.env.OLLAMA_API_KEY || "";

const ollamaHeaders = {
  "Content-Type": "application/json",
  ...(ollamaApiKey ? { Authorization: `Bearer ${ollamaApiKey}` } : {})
};

app.use(cors());
app.use(express.json({ limit: "1mb" }));

// System prompt: cacheable, contains common instructions
const SYSTEM_PROMPT = `You are a professional writing assistant that refines and improves text.

Core Instructions:
- Return ONLY the refined text with no preamble, explanations, or meta-commentary
- Preserve the original meaning and intent unless instructed otherwise
- Do not use emojis or contractions (e.g., use "do not" instead of "don't")
- Follow markdown formatting only if the input uses it; otherwise, use plain text
- Apply any additional constraints (tone, style, audience, word limit) specified in the user message`;

// Task-specific instructions: brief and focused
const REFINE_TASKS = {
  formal: "Rewrite this text in a formal, professional tone.",
  clarity: "Improve the clarity and readability of this text.",
  concise: "Make this text shorter and more concise while preserving key points.",
  elaborate: "Expand this text with additional detail and explanation.",
  grammar: "Correct all grammar, spelling, and punctuation errors.",
  simplify: "Simplify this text using clearer language and structure.",
  tone: "Adjust this text to a professional and positive tone."
};

function buildOllamaRequest(body) {
  // Support two formats:
  // - { model, refinement, text, tone?, style?, audience?, purpose?, maxWords? }
  // - { model, messages: [...] }
  const model = body.model || "llama3";
  if (Array.isArray(body.messages)) {
    return { model, messages: body.messages };
  }

  const task = (body.refinement || "clarity").toLowerCase();
  const text = String(body.text || "").trim();
  const taskInstruction = REFINE_TASKS[task] ?? REFINE_TASKS.clarity;

  // Build additional constraints (only if specified)
  const constraints = [];

  if (body.tone) {
    constraints.push(`Tone: ${body.tone}`);
  }
  if (body.style) {
    constraints.push(`Style: ${body.style}`);
  }
  if (body.audience) {
    constraints.push(`Audience: ${body.audience}`);
  }
  if (body.purpose) {
    constraints.push(`Purpose: ${body.purpose}`);
  }
  if (body.maxWords) {
    constraints.push(`Word limit: ${body.maxWords} words maximum`);
  }

  // Construct clean, structured user message
  const constraintsSection = constraints.length > 0
    ? `\n\nConstraints:\n${constraints.map(c => `- ${c}`).join('\n')}`
    : '';

  const userContent = `${taskInstruction}${constraintsSection}\n\nText to refine:\n${text}`;

  return {
    model,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userContent }
    ]
  };
}

app.post("/v1/chat/completions", async (req, res) => {
  const requestBody = req.body;
  if (!requestBody) {
    return res.status(400).json({ error: "Missing request body" });
  }

  const payload = buildOllamaRequest(requestBody);

  try {
    const sessionHeader = { "X-Session-ID": `write-right-${Date.now()}` };
    const response = await fetch(ollamaUrl, {
      method: "POST",
      headers: { ...ollamaHeaders, ...sessionHeader },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    // Ollama returns a similar structure; proxy it.
    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    return res.json(data);
  } catch (err) {
    console.error("Failed to contact Ollama:", err);
    res.status(502).json({ error: "Failed to contact local Ollama instance.", details: err.message });
  }
});

app.get("/v1/models", async (_, res) => {
  // Fetch model list from Ollama (v1/models endpoint).
  try {
    const sessionHeader = { "X-Session-ID": `write-right-${Date.now()}` };
    const response = await fetch(`${ollamaBaseUrl}/v1/models`, {
      headers: { ...ollamaHeaders, ...sessionHeader }
    });
    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data });
    }

    // Ollama v1/models returns an object like:
    // { object: "list", data: [{ id: "llama3:latest", ... }, ...] }
    const models = Array.isArray(data?.data)
      ? data.data.map((m) => m.id).filter(Boolean)
      : [];

    return res.json({ models });
  } catch (err) {
    console.error("Failed to fetch model list from Ollama:", err);
    return res.status(502).json({
      error: "Failed to fetch model list from Ollama.",
      details: err.message
    });
  }
});

app.get("/health", async (_, res) => {
  // Quick self-test: verify Ollama is reachable and returns a response.
  const testPayload = {
    model: "llama3",
    messages: [
      { role: "system", content: "You are a helpful assistant. Respond concisely." },
      { role: "user", content: "Reply with only the word: OK" }
    ]
  };

  try {
    const response = await fetch(ollamaUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(testPayload)
    });

    const data = await response.json();
    const ok = response.ok && Array.isArray(data?.choices) && data.choices[0]?.message?.content;

    return res.json({
      status: ok ? "ok" : "error",
      backend: "ai-text-refiner",
      ollamaUrl,
      ollama: {
        reachable: response.ok,
        result: response.ok ? data.choices?.[0]?.message?.content : undefined,
        raw: response.ok ? undefined : data
      }
    });
  } catch (err) {
    return res.status(502).json({
      status: "error",
      backend: "ai-text-refiner",
      ollamaUrl,
      error: "Failed to contact local Ollama instance.",
      details: err.message
    });
  }
});

app.listen(port, () => {
  console.log(`AI Text Refiner backend listening on http://localhost:${port}`);
  console.log(`Forwarding to Ollama at ${ollamaUrl}`);
});
