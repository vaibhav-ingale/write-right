const statusEl = document.getElementById("status");
const checkBtn = document.getElementById("check");
const serverLink = document.getElementById("serverLink");
const modelSelect = document.getElementById("modelSelect");
const modelStatus = document.getElementById("modelStatus");

const BACKEND_BASE = "http://localhost:8000";
const BACKEND_URL = `${BACKEND_BASE}/v1/chat/completions`;
const MODELS_URL = `${BACKEND_BASE}/v1/models`;

let selectedModel = "";

async function checkBackend() {
  statusEl.textContent = "Checking...";
  try {
    const response = await fetch(BACKEND_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        refinement: "clarity",
        text: "Hello from AI Text Refiner"
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
    { requireModifierShortcut: true, selectedModel: "" },
    (data) => {
      modifierToggle.checked = Boolean(data.requireModifierShortcut);
      selectedModel = data.selectedModel || "";
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

async function loadModels() {
  if (!modelSelect) return;
  modelStatus.textContent = "Loading models...";
  modelSelect.disabled = true;

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

checkBtn.addEventListener("click", checkBackend);
serverLink.addEventListener("click", (e) => {
  e.preventDefault();
  checkBackend();
});

loadSettings();
