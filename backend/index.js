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

const REFINE_PROMPTS = {
  formal:
    "Rewrite the following text in a more formal tone while preserving the meaning.\nRespond with only the rewritten text; do not add explanations, disclaimers, or extra wording.\n\n",
  clarity:
    "Rewrite the following text to improve clarity and readability.\nRespond with only the rewritten text; do not add explanations, disclaimers, or extra wording.\n\n",
  concise:
    "Make the following text shorter and more concise while keeping the main meaning.\nRespond with only the rewritten text; do not add explanations, disclaimers, or extra wording.\n\n",
  elaborate:
    "Expand the following text with more detail and explanation while preserving the original meaning.\nRespond with only the rewritten text; do not add explanations, disclaimers, or extra wording.\n\n",
  grammar:
    "Correct grammar, spelling, and punctuation in the following text.\nRespond with only the rewritten text; do not add explanations, disclaimers, or extra wording.\n\n",
  simplify:
    "Rewrite the following text using simpler words and clearer structure.\nRespond with only the rewritten text; do not add explanations, disclaimers, or extra wording.\n\n",
  tone:
    "Rewrite the following text with a more professional and positive tone.\nRespond with only the rewritten text; do not add explanations, disclaimers, or extra wording.\n\n"
};

function buildOllamaRequest(body) {
  // Support two formats:
  // - { model, refinement, text }
  // - { model, messages: [...] }
  const model = body.model || "llama3";
  if (Array.isArray(body.messages)) {
    return { model, messages: body.messages };
  }

  const task = (body.refinement || "clarity").toLowerCase();
  const text = String(body.text || "").trim();
  const promptPrefix = REFINE_PROMPTS[task] ?? REFINE_PROMPTS.clarity;

  // Additional style guidance
  const tone = body.tone ? String(body.tone).toLowerCase() : "";
  const style = body.style ? String(body.style).toLowerCase() : "";
  const audience = body.audience ? String(body.audience).toLowerCase() : "";
  const purpose = body.purpose ? String(body.purpose).toLowerCase() : "";

  const tonePhrase = tone ? ` Use a ${tone} tone.` : "";
  const stylePhrase = style ? ` Use a ${style} writing style.` : "";
  const audiencePhrase = audience ? ` Target the response to ${audience}.` : "";
  const purposePhrase = purpose ? ` The goal is to ${purpose}.` : "";

  const wordLimitPhrase = body.maxWords ? ` Limit the response to ${body.maxWords} words.` : "";

  // Strict formatting rules
  const formattingRules =
    " Do not use emojis, markdown formatting, or contractions (e.g. use 'I am' not 'I'm').";

  const additionalInstructions = `${tonePhrase}${stylePhrase}${audiencePhrase}${purposePhrase}`.trim();
  const userContent = `${promptPrefix}${formattingRules}${additionalInstructions ? additionalInstructions + " " : ""}${text}${wordLimitPhrase}`;

  return {
    model,
    messages: [
      { role: "system", content: "You are a helpful writing assistant." },
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
      { role: "system", content: "You are a helpful assistant." },
      { role: "user", content: "Reply with a single word: Hello" }
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
