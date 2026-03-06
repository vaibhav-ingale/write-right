const statusEl = document.getElementById("status");
const checkBtn = document.getElementById("check");
const serverLink = document.getElementById("serverLink");
const modelSelect = document.getElementById("modelSelect");
const modelStatus = document.getElementById("modelStatus");
const wordLimitInput = document.getElementById("wordLimit");
const wordLimitStatus = document.getElementById("wordLimitStatus");
const passwordLengthInput = document.getElementById("passwordLength");
const generatePasswordBtn = document.getElementById("generatePassword");
const passwordStatus = document.getElementById("passwordStatus");
const wordCountStatus = document.createElement("div");

const BACKEND_BASE = "http://localhost:8000";
const BACKEND_URL = `${BACKEND_BASE}/v1/chat/completions`;
const MODELS_URL = `${BACKEND_BASE}/v1/models`;

let selectedModel = "";
let wordLimit = null;

async function checkBackend() {
  statusEl.textContent = "Checking...";
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refinement: "clarity",
        text: "Hello from Write Right"
      })
    });

    if (!response.ok) {
      const text = await response.text();
      statusEl.textContent = `Backend error: ${response.status} ${response.statusText} - ${text}`;
      return;
    }

    const payload = await response.json();
    statusEl.textContent = `Backend OK — got ${payload?.choices?.[0]?.message?.content?.length ?? 0} chars back.`;
  } catch (err) {
    statusEl.textContent = `Unable to reach backend: ${err.message}`;
  }
}

const modifierToggle = document.getElementById("modifierToggle");

function loadSettings() {
  if (!chrome?.storage?.local) return;
  chrome.storage.local.get(
    { requireModifierShortcut: true, selectedModel: "", wordLimit: null },
    (data) => {
      modifierToggle.checked = Boolean(data.requireModifierShortcut);
      selectedModel = data.selectedModel || "";
      wordLimit = typeof data.wordLimit === "number" ? data.wordLimit : null;
      if (wordLimit !== null) {
        wordLimitInput.value = wordLimit;
      }
      loadModels();
    }
  );
}

function setModifierSetting(enabled) {
  if (!chrome?.storage?.local) return;
  chrome.storage.local.set({ requireModifierShortcut: enabled });
}

function setSelectedModel(model) {
  selectedModel = model || "";
  if (!chrome?.storage?.local) return;
  chrome.storage.local.set({ selectedModel: selectedModel });
}

function setWordLimit(limit) {
  wordLimit = limit;
  if (!chrome?.storage?.local) return;
  chrome.storage.local.set({ wordLimit: limit });
}

async function loadModels() {
  if (!modelSelect) return;
  modelStatus.textContent = "Loading models...";
  modelSelect.disabled = true;
  wordCountStatus.textContent = "";

  // Ensure the word count status element is visible.
  if (!wordCountStatus.parentElement) {
    const statusContainer = document.querySelector(".status");
    if (statusContainer) {
      wordCountStatus.style.marginTop = "6px";
      wordCountStatus.style.fontSize = "12px";
      wordCountStatus.style.opacity = "0.85";
      statusContainer.appendChild(wordCountStatus);
    }
  }

  try {
    const response = await fetch(MODELS_URL);
    const data = await response.json();

    if (!response.ok) {
      modelStatus.textContent = `Failed to load models: ${response.status}`;
      return;
    }

    const models = Array.isArray(data.models) ? data.models : [];

    modelSelect.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Use backend default model";
    modelSelect.appendChild(defaultOption);

    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      modelSelect.appendChild(option);
    });

    if (selectedModel) {
      modelSelect.value = selectedModel;
    }

    modelStatus.textContent = "";
  } catch (err) {
    modelStatus.textContent = `Unable to load models: ${err.message}`;
  } finally {
    modelSelect.disabled = false;
  }
}

modifierToggle.addEventListener("change", (e) => {
  setModifierSetting(e.target.checked);
});

modelSelect.addEventListener("change", (e) => {
  setSelectedModel(e.target.value);
});

wordLimitInput.addEventListener("input", (e) => {
  const value = Number(e.target.value);
  if (!value || value < 1) {
    wordLimit = null;
    wordLimitStatus.textContent = "Leave empty for no limit.";
    setWordLimit(null);
    return;
  }

  wordLimit = value;
  wordLimitStatus.textContent = `Limit set to ${value} words.`;
  setWordLimit(value);
});

generatePasswordBtn.addEventListener("click", () => {
  const length = Number(passwordLengthInput.value) || 20;
  const password = generatePassword(length);
  passwordStatus.textContent = "Password generated — pasted into text box.";

  // Send message to content script to insert into current field.
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs[0]?.id) return;
    chrome.tabs.sendMessage(tabs[0].id, { type: "INSERT_PASSWORD", password });
  });
});

function generatePassword(length = 20) {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()-_=+[]{}|;:,.<>?";
  let result = "";
  for (let i = 0; i < length; i++) {
    const idx = Math.floor(Math.random() * chars.length);
    result += chars[idx];
  }
  return result;
}

checkBtn.addEventListener("click", checkBackend);
serverLink.addEventListener("click", (e) => {
  e.preventDefault();
  checkBackend();
});

loadSettings();
