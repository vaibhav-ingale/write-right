const statusEl = document.getElementById("status");
const checkBtn = document.getElementById("check");
const serverLink = document.getElementById("serverLink");
const endpointDisplay = document.getElementById("endpointDisplay");
const endpointInput = document.getElementById("endpointInput");
const endpointInputGroup = document.getElementById("endpointInputGroup");
const editEndpointBtn = document.getElementById("editEndpoint");
const saveEndpointBtn = document.getElementById("saveEndpoint");
const cancelEndpointBtn = document.getElementById("cancelEndpoint");

const DEFAULT_BACKEND = "http://localhost:8000";
let currentBackendUrl = DEFAULT_BACKEND;

async function checkBackend() {
  statusEl.textContent = "Checking connection...";
  statusEl.className = "status checking";

  const modelsUrl = `${currentBackendUrl}/v1/models`;
  console.log('[Write Right] Checking backend at:', modelsUrl);

  try {
    const response = await fetch(modelsUrl, {
      method: "GET",
      headers: { "Content-Type": "application/json" }
    });

    console.log('[Write Right] Response status:', response.status);

    if (!response.ok) {
      statusEl.className = "status error";
      statusEl.textContent = `Backend error: ${response.status} ${response.statusText}`;
      return;
    }

    const payload = await response.json();
    console.log('[Write Right] Response payload:', payload);

    // Handle different response structures
    let modelCount = 0;
    if (Array.isArray(payload?.data)) {
      modelCount = payload.data.length;
    } else if (Array.isArray(payload?.models)) {
      modelCount = payload.models.length;
    } else if (Array.isArray(payload)) {
      modelCount = payload.length;
    } else if (payload?.object === 'list' && Array.isArray(payload?.data)) {
      modelCount = payload.data.length;
    }

    statusEl.className = "status success";
    statusEl.textContent = `✓ Backend is running! Found ${modelCount} model${modelCount !== 1 ? 's' : ''} available.`;
  } catch (err) {
    console.error('[Write Right] Backend check failed:', err);
    statusEl.className = "status error";
    statusEl.textContent = `✗ Unable to reach backend: ${err.message}`;
  }
}

const modifierToggle = document.getElementById("modifierToggle");

function loadSettings() {
  if (!chrome?.storage?.local) return;
  chrome.storage.local.get({
    requireModifierShortcut: true,
    backendEndpoint: DEFAULT_BACKEND
  }, (data) => {
    modifierToggle.checked = Boolean(data.requireModifierShortcut);
    currentBackendUrl = data.backendEndpoint || DEFAULT_BACKEND;
    endpointDisplay.textContent = currentBackendUrl;
    endpointInput.value = currentBackendUrl;
  });
}

function setModifierSetting(enabled) {
  if (!chrome?.storage?.local) return;
  chrome.storage.local.set({ requireModifierShortcut: enabled });
}


modifierToggle.addEventListener("change", (e) => {
  setModifierSetting(e.target.checked);
});

// Endpoint editing functionality
editEndpointBtn.addEventListener("click", () => {
  endpointDisplay.parentElement.style.display = "none";
  endpointInputGroup.classList.add("active");
  endpointInput.focus();
});

cancelEndpointBtn.addEventListener("click", () => {
  endpointInput.value = currentBackendUrl;
  endpointInputGroup.classList.remove("active");
  endpointDisplay.parentElement.style.display = "flex";
});

saveEndpointBtn.addEventListener("click", () => {
  let newEndpoint = endpointInput.value.trim();

  // Remove trailing slash if present
  if (newEndpoint.endsWith('/')) {
    newEndpoint = newEndpoint.slice(0, -1);
  }

  // Basic validation
  if (!newEndpoint.startsWith('http://') && !newEndpoint.startsWith('https://')) {
    statusEl.className = "status error";
    statusEl.textContent = "✗ Endpoint must start with http:// or https://";
    return;
  }

  currentBackendUrl = newEndpoint;
  endpointDisplay.textContent = newEndpoint;

  // Save to storage
  if (chrome?.storage?.local) {
    chrome.storage.local.set({ backendEndpoint: newEndpoint }, () => {
      statusEl.className = "status success";
      statusEl.textContent = "✓ Backend endpoint saved successfully!";

      // Update content script
      chrome.tabs.query({}, (tabs) => {
        tabs.forEach(tab => {
          chrome.tabs.sendMessage(tab.id, {
            type: "updateBackendEndpoint",
            endpoint: newEndpoint
          }).catch(() => {
            // Ignore errors for tabs that don't have the content script
          });
        });
      });
    });
  }

  endpointInputGroup.classList.remove("active");
  endpointDisplay.parentElement.style.display = "flex";
});

// Allow Enter to save, Escape to cancel
endpointInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    saveEndpointBtn.click();
  } else if (e.key === "Escape") {
    cancelEndpointBtn.click();
  }
});

checkBtn.addEventListener("click", checkBackend);
serverLink.addEventListener("click", (e) => {
  e.preventDefault();
  checkBackend();
});

loadSettings();
