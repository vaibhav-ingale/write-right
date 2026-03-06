const statusEl = document.getElementById("status");
const checkBtn = document.getElementById("check");
const serverLink = document.getElementById("serverLink");

const BACKEND_URL = "http://localhost:8000/v1/chat/completions";

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
  chrome.storage.local.get({ requireModifierShortcut: true }, (data) => {
    modifierToggle.checked = Boolean(data.requireModifierShortcut);
  });
}

function setModifierSetting(enabled) {
  if (!chrome?.storage?.local) return;
  chrome.storage.local.set({ requireModifierShortcut: enabled });
}

modifierToggle.addEventListener("change", (e) => {
  setModifierSetting(e.target.checked);
});

checkBtn.addEventListener("click", checkBackend);
serverLink.addEventListener("click", (e) => {
  e.preventDefault();
  checkBackend();
});

loadSettings();
