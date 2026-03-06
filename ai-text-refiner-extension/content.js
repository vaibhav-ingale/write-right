// Write Right content script
// Listens for `\` (backslash) key while focus is inside editable element, then shows a floating UI.

const REFINE_SHORTCUT_KEY = "\\";
const API_ENDPOINT = "http://localhost:8000/v1/chat/completions";
const MODELS_ENDPOINT = "http://localhost:8000/v1/models";

let activeElement = null;
let popup = null;
let currentText = "";
let requireModifierShortcut = true; // can be toggled via the extension popup
let selectedModel = "";
let wordLimit = null;
let selectedTone = null;
let selectedStyle = null;
let selectedAudience = null;
let selectedPurpose = null;

const TONE_OPTIONS = [
  { value: "", label: "None" },
  { value: "formal", label: "Formal" },
  { value: "casual", label: "Casual" },
  { value: "funny", label: "Funny" },
  { value: "sarcastic", label: "Sarcastic" }
];

const STYLE_OPTIONS = [
  { value: "", label: "None" },
  { value: "simple", label: "Simple" },
  { value: "complex", label: "Complex" },
  { value: "persuasive", label: "Persuasive" },
  { value: "narrative", label: "Narrative" }
];

const AUDIENCE_OPTIONS = [
  { value: "", label: "None" },
  { value: "general", label: "General" },
  { value: "professionals", label: "Professionals" },
  { value: "students", label: "Students" },
  { value: "customers", label: "Customers" }
];

const PURPOSE_OPTIONS = [
  { value: "", label: "None" },
  { value: "inform", label: "Inform" },
  { value: "request", label: "Request" },
  { value: "complain", label: "Complain" },
  { value: "persuade", label: "Persuade" },
  { value: "appreciate", label: "Appreciate" }
];

function loadSettings() {
  if (!chrome?.storage?.local) return;
  chrome.storage.local.get(
    {
      requireModifierShortcut: true,
      selectedModel: "",
      wordLimit: null,
      selectedTone: null,
      selectedStyle: null,
      selectedAudience: null,
      selectedPurpose: null
    },
    (data) => {
      requireModifierShortcut = data.requireModifierShortcut;
      selectedModel = data.selectedModel || "";
      wordLimit = typeof data.wordLimit === "number" ? data.wordLimit : null;
      selectedTone = data.selectedTone || null;
      selectedStyle = data.selectedStyle || null;
      selectedAudience = data.selectedAudience || null;
      selectedPurpose = data.selectedPurpose || null;
    }
  );
}

function watchSettingsChanges() {
  if (!chrome?.storage?.onChanged) return;
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.requireModifierShortcut) {
      requireModifierShortcut = changes.requireModifierShortcut.newValue;
    }
    if (changes.selectedModel) {
      selectedModel = changes.selectedModel.newValue || "";
    }
    if (changes.wordLimit) {
      wordLimit = changes.wordLimit.newValue;
    }
    if (changes.selectedTone) {
      selectedTone = changes.selectedTone.newValue || null;
    }
    if (changes.selectedStyle) {
      selectedStyle = changes.selectedStyle.newValue || null;
    }
    if (changes.selectedAudience) {
      selectedAudience = changes.selectedAudience.newValue || null;
    }
    if (changes.selectedPurpose) {
      selectedPurpose = changes.selectedPurpose.newValue || null;
    }
  });
}

loadSettings();
watchSettingsChanges();

function isEditable(el) {
  if (!el) return false;
  if (el.isContentEditable) return true;
  const tag = el.tagName?.toLowerCase();
  return tag === "input" || tag === "textarea";
}

function getTextFromElement(el) {
  if (!el) return "";

  // Prefer selected text when available, falling back to full value.
  if (el.tagName?.toLowerCase() === "input" || el.tagName?.toLowerCase() === "textarea") {
    const value = el.value;
    const selectionStart = el.selectionStart;
    const selectionEnd = el.selectionEnd;
    if (typeof selectionStart === "number" && typeof selectionEnd === "number" && selectionStart !== selectionEnd) {
      return value.slice(selectionStart, selectionEnd);
    }
    return value;
  }

  if (el.isContentEditable) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount) {
      const range = selection.getRangeAt(0);
      if (el.contains(range.commonAncestorContainer)) {
        const selectedText = selection.toString();
        if (selectedText.trim()) {
          return selectedText;
        }
      }
    }
    return el.innerText;
  }

  return "";
}

function setTextToElement(el, text) {
  if (!el) return;

  if (el.isContentEditable) {
    el.innerText = text;
    return;
  }

  if (el.tagName?.toLowerCase() === "input" || el.tagName?.toLowerCase() === "textarea") {
    el.value = text;

    // Frameworks (React/Vue/etc.) often rely on input events to detect changes.
    const event = new Event("input", { bubbles: true });
    el.dispatchEvent(event);

    return;
  }
}

async function loadModelsForPopup(selectEl, statusEl) {
  if (!selectEl) return;
  statusEl.textContent = "Loading models...";
  selectEl.disabled = true;

  try {
    const response = await fetch(MODELS_ENDPOINT);
    const data = await response.json();

    if (!response.ok) {
      statusEl.textContent = `Failed to load models: ${response.status}`;
      return;
    }

    const models = Array.isArray(data.models) ? data.models : [];

    selectEl.innerHTML = "";
    const defaultOption = document.createElement("option");
    defaultOption.value = "";
    defaultOption.textContent = "Use backend default model";
    selectEl.appendChild(defaultOption);

    models.forEach((model) => {
      const option = document.createElement("option");
      option.value = model;
      option.textContent = model;
      selectEl.appendChild(option);
    });

    if (selectedModel) {
      selectEl.value = selectedModel;
    }

    statusEl.textContent = "";
  } catch (err) {
    statusEl.textContent = `Unable to load models: ${err.message}`;
  } finally {
    selectEl.disabled = false;
  }
}

function createPopup() {
  const wrapper = document.createElement("div");
  wrapper.id = "ai-text-refiner-popup";
  wrapper.style.position = "fixed";
  wrapper.style.zIndex = "999999";
  wrapper.style.minWidth = "320px";
  wrapper.style.maxWidth = "420px";
  // Frosted glass look: use a semi-transparent background + backdrop blur.
  wrapper.style.background = "rgba(20, 20, 25, 0.65)";
  wrapper.style.border = "1px solid rgba(255, 255, 255, 0.05)";
  wrapper.style.borderRadius = "12px";
  wrapper.style.boxShadow = "0 10px 50px rgb(0, 0, 0)";
  wrapper.style.color = "#fff";
  wrapper.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  wrapper.style.padding = "10px";
  wrapper.style.backdropFilter = "blur(10px)";
  wrapper.style.webkitBackdropFilter = "blur(10px)";
  wrapper.style.transition = "opacity 120ms ease";
  wrapper.style.opacity = "0";
  wrapper.style.maxHeight = "70vh";
  wrapper.style.overflow = "hidden";

  wrapper.innerHTML = `
    <style>
      .switch {
        position: relative;
        display: inline-block;
        width: 44px;
        height: 24px;
      }

      .switch input {
        opacity: 0;
        width: 0;
        height: 0;
      }

      .slider {
        position: absolute;
        cursor: pointer;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background-color: rgba(255, 255, 255, 0.25);
        transition: 0.2s;
        border-radius: 999px;
      }

      .slider:before {
        position: absolute;
        content: "";
        height: 18px;
        width: 18px;
        left: 3px;
        bottom: 3px;
        background-color: white;
        transition: 0.2s;
        border-radius: 50%;
      }

      input:checked + .slider {
        background-color: rgba(31, 111, 235, 0.9);
      }

      input:focus + .slider {
        box-shadow: 0 0 1px rgba(31, 111, 235, 0.9);
      }

      input:checked + .slider:before {
        transform: translateX(20px);
      }
    </style>

    <div id="ai-text-refiner-header" style="display:flex; justify-content:space-between; align-items:center; cursor:grab; padding-bottom: 8px;">
      <div style="font-weight:600; font-size:14px;">Write Right - AI Text Refiner</div>
      <button id="ai-text-refiner-close" style="background:transparent; border:none; color:rgba(255,255,255,0.7); font-size:18px; cursor:pointer;">×</button>
    </div>
    <textarea id="ai-text-refiner-input" style="width:100%; height:140px; resize:vertical; border-radius:8px; border:1px solid rgba(255,255,255,0.18); padding:8px; background:rgba(0,0,0,0.45); color:#fff; outline:none; font-size:13px;" spellcheck="true"></textarea>

    <div style="display:flex; justify-content:space-between; align-items:center; margin-top:10px;">
      <div style="font-size:12px; opacity:0.75;">Advanced settings</div>
      <button id="ai-text-refiner-advanced-toggle" style="background:rgba(255,255,255,0.1); border:none; color:#fff; padding:4px 8px; border-radius:8px; cursor:pointer; font-size:12px;">Show ▾</button>
    </div>

    <div id="ai-text-refiner-advanced" style="display:none; flex-wrap:wrap; gap:8px; margin-top:8px;">
      <div style="flex:1 1 180px; min-width:160px;">
        <label style="font-size:11px; opacity:0.75;">Model</label>
        <select id="ai-text-refiner-model" style="width:100%; height:34px; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.18); background:rgba(0,0,0,0.4); color:#fff;"></select>
        <div id="ai-text-refiner-model-status" style="font-size:10px; opacity:0.7; margin-top:4px;">Loading models...</div>
      </div>
      <div style="flex:1 1 140px; min-width:140px;">
        <label style="font-size:11px; opacity:0.75;">Word limit</label>
        <input id="ai-text-refiner-wordlimit" type="number" min="1" placeholder="e.g. 400" style="width:100%; height:34px; padding:6px 8px; border-radius:8px; border:1px solid rgba(255,255,255,0.18); background:rgba(0,0,0,0.4); color:#fff;" />
        <div id="ai-text-refiner-wordlimit-status" style="font-size:10px; opacity:0.7; margin-top:4px;">Optional</div>
      </div>
      <div style="flex:1 1 180px; min-width:160px;">
        <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
          <div style="display:flex; gap:6px; align-items:center;">
            <div style="font-size:11px; opacity:0.75; width:70px;">Tone</div>
            <div id="ai-text-refiner-tone-options" style="display:flex; gap:6px;"></div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <div style="font-size:11px; opacity:0.75; width:70px;">Style</div>
            <div id="ai-text-refiner-style-options" style="display:flex; gap:6px;"></div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <div style="font-size:11px; opacity:0.75; width:70px;">Audience</div>
            <div id="ai-text-refiner-audience-options" style="display:flex; gap:6px;"></div>
          </div>
          <div style="display:flex; gap:6px; align-items:center;">
            <div style="font-size:11px; opacity:0.75; width:70px;">Purpose</div>
            <div id="ai-text-refiner-purpose-options" style="display:flex; gap:6px;"></div>
          </div>
        </div>
      </div>
    </div>

    <div id="ai-text-refiner-buttons" style="display:flex; flex-wrap:wrap; gap:6px; padding-top:8px;"></div>
    <div style="display:flex; justify-content:flex-end; margin-top:10px;">
      <button id="ai-text-refiner-apply" style="background:#1f6feb; border:none; color:#fff; padding:8px 14px; border-radius:8px; cursor:pointer; font-weight:600;">Insert Text</button>
    </div>
    <div id="ai-text-refiner-count" style="margin-top:8px; font-size:11px; color:rgba(180,220,255,0.75);"></div>
    <div id="ai-text-refiner-status" style="margin-top:4px; font-size:11px; color:rgba(255,255,255,0.7);"></div>
  `;

  document.body.appendChild(wrapper);
  requestAnimationFrame(() => {
    wrapper.style.opacity = "1";
  });

  const closeBtn = wrapper.querySelector("#ai-text-refiner-close");
  closeBtn.addEventListener("click", () => closePopup());

  const advancedToggle = wrapper.querySelector("#ai-text-refiner-advanced-toggle");
  const advancedSection = wrapper.querySelector("#ai-text-refiner-advanced");
  let advancedOpen = false;

  const setAdvancedOpen = (open) => {
    advancedOpen = open;
    advancedSection.style.display = open ? "flex" : "none";
    advancedToggle.textContent = open ? "Hide ▴" : "Show ▾";
  };

  advancedToggle.addEventListener("click", () => setAdvancedOpen(!advancedOpen));

  wrapper.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      closePopup();
    }
  });

  const header = wrapper.querySelector("#ai-text-refiner-header");
  makeDraggable(wrapper, header);

  const textarea = wrapper.querySelector("#ai-text-refiner-input");
  textarea.addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      applyResult();
    }
  });

  const buttons = [
    { id: "formal", label: "Formal" },
    { id: "clarity", label: "Clarity" },
    { id: "concise", label: "Concise" },
    { id: "elaborate", label: "Elaborate" },
    { id: "grammar", label: "Fix Grammar" },
    { id: "simplify", label: "Simplify" },
    { id: "tone", label: "Improve Tone" }
  ];

  const btnContainer = wrapper.querySelector("#ai-text-refiner-buttons");
  buttons.forEach((btn) => {
    const b = document.createElement("button");
    b.textContent = btn.label;
    b.dataset.task = btn.id;
    b.style.background = "rgba(255,255,255,0.1)";
    b.style.border = "1px solid rgba(255,255,255,0.18)";
    b.style.color = "#fff";
    b.style.padding = "6px 10px";
    b.style.borderRadius = "8px";
    b.style.cursor = "pointer";
    b.style.fontSize = "12px";
    b.style.flex = "1 0 120px";
    b.addEventListener("click", () => runRefinement(b.dataset.task));
    btnContainer.appendChild(b);
  });

  const apply = wrapper.querySelector("#ai-text-refiner-apply");
  apply.addEventListener("click", applyResult);

  return wrapper;
}

function makeDraggable(wrapper, handle) {
  let isDragging = false;
  let startX = 0;
  let startY = 0;
  let startLeft = 0;
  let startTop = 0;

  const onMouseDown = (event) => {
    isDragging = true;
    startX = event.clientX;
    startY = event.clientY;
    const rect = wrapper.getBoundingClientRect();
    startLeft = rect.left;
    startTop = rect.top;
    wrapper.style.cursor = "grabbing";
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    event.preventDefault();
  };

  const onMouseMove = (event) => {
    if (!isDragging) return;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    wrapper.style.left = `${startLeft + deltaX}px`;
    wrapper.style.top = `${startTop + deltaY}px`;
  };

  const onMouseUp = () => {
    isDragging = false;
    wrapper.style.cursor = "grab";
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  };

  handle.addEventListener("mousedown", onMouseDown);
}

function openPopupForElement(el, keyboardEvent) {
  if (!el) return;

  activeElement = el;
  currentText = getTextFromElement(el) || "";

  if (!popup) {
    popup = createPopup();
  }

  const textarea = popup.querySelector("#ai-text-refiner-input");
  textarea.value = currentText;
  textarea.focus();
  textarea.select();
  const modelSelect = popup.querySelector("#ai-text-refiner-model");
  const modelStatus = popup.querySelector("#ai-text-refiner-model-status");
  const wordLimitInput = popup.querySelector("#ai-text-refiner-wordlimit");
  const wordLimitStatus = popup.querySelector("#ai-text-refiner-wordlimit-status");
  const toneOptions = popup.querySelector("#ai-text-refiner-tone-options");
  const styleOptions = popup.querySelector("#ai-text-refiner-style-options");
  const audienceOptions = popup.querySelector("#ai-text-refiner-audience-options");
  const purposeOptions = popup.querySelector("#ai-text-refiner-purpose-options");

  const createOptionButtons = (container, options, selectedValue, onSelect) => {
    if (!container) return;
    container.innerHTML = "";
    const activeValue = selectedValue ?? "";
    options.forEach((opt) => {
      const btn = document.createElement("button");
      btn.textContent = opt.label;
      btn.dataset.value = opt.value;
      const isActive = opt.value === activeValue;
      btn.style.background = isActive ? "rgba(31,111,235,0.9)" : "rgba(255,255,255,0.1)";
      btn.style.color = isActive ? "#fff" : "rgba(255,255,255,0.8)";
      btn.style.border = "1px solid rgba(255,255,255,0.18)";
      btn.style.borderRadius = "8px";
      btn.style.padding = "4px 10px";
      btn.style.fontSize = "11px";
      btn.style.cursor = "pointer";
      btn.addEventListener("click", () => {
        onSelect(opt.value);
        createOptionButtons(container, options, opt.value, onSelect);
      });
      container.appendChild(btn);
    });
  };

  if (wordLimit !== null) {
    wordLimitInput.value = wordLimit;
    wordLimitStatus.textContent = `Limit set to ${wordLimit} words.`;
  }

  modelSelect.addEventListener("change", (event) => {
    selectedModel = event.target.value;
    chrome.storage.local?.set?.({ selectedModel });
  });

  wordLimitInput.addEventListener("input", (event) => {
    const value = Number(event.target.value);
    if (!value || value < 1) {
      wordLimit = null;
      wordLimitStatus.textContent = "Optional";
      chrome.storage.local?.set?.({ wordLimit: null });
      return;
    }
    wordLimit = value;
    wordLimitStatus.textContent = `Limit set to ${value} words.`;
    chrome.storage.local?.set?.({ wordLimit });
  });

  const saveSettings = () => {
    chrome.storage.local?.set?.({
      selectedModel,
      wordLimit,
      selectedTone,
      selectedStyle,
      selectedAudience,
      selectedPurpose
    });
  };

  const renderOptionGroups = () => {
    createOptionButtons(toneOptions, TONE_OPTIONS, selectedTone, (value) => {
      selectedTone = value || null;
      saveSettings();
    });
    createOptionButtons(styleOptions, STYLE_OPTIONS, selectedStyle, (value) => {
      selectedStyle = value || null;
      saveSettings();
    });
    createOptionButtons(audienceOptions, AUDIENCE_OPTIONS, selectedAudience, (value) => {
      selectedAudience = value || null;
      saveSettings();
    });
    createOptionButtons(purposeOptions, PURPOSE_OPTIONS, selectedPurpose, (value) => {
      selectedPurpose = value || null;

      // If user chooses 'None' for purpose, clear any word-limit to avoid implicit constraints.
      if (!value) {
        wordLimit = null;
        const wordLimitInput = popup.querySelector("#ai-text-refiner-wordlimit");
        const wordLimitStatus = popup.querySelector("#ai-text-refiner-wordlimit-status");
        if (wordLimitInput) {
          wordLimitInput.value = "";
        }
        if (wordLimitStatus) {
          wordLimitStatus.textContent = "Optional";
        }
      }

      saveSettings();
    });
  };

  renderOptionGroups();
  loadModelsForPopup(modelSelect, modelStatus);
  positionPopup(keyboardEvent);
}

function positionPopup(event) {
  if (!popup) return;

  const x = event?.clientX ?? window.innerWidth / 2;
  const y = event?.clientY ?? window.innerHeight / 2;

  const rect = popup.getBoundingClientRect();
  const left = Math.min(Math.max(12, x - rect.width / 2), window.innerWidth - rect.width - 12);
  const top = Math.min(Math.max(12, y - rect.height / 2), window.innerHeight - rect.height - 12);

  popup.style.left = `${left}px`;
  popup.style.top = `${top}px`;
}

function closePopup() {
  if (!popup) return;
  popup.remove();
  popup = null;
  activeElement = null;
  currentText = "";
}

function setStatus(message, isError) {
  if (!popup) return;
  const status = popup.querySelector("#ai-text-refiner-status");
  if (!status) return;
  status.textContent = message;
  status.style.color = isError ? "rgba(255, 120, 120, 0.95)" : "rgba(180, 220, 255, 0.9)";
}

async function runRefinement(task) {
  if (!popup) return;
  const textarea = popup.querySelector("#ai-text-refiner-input");
  const text = textarea.value.trim();
  if (!text) {
    setStatus("Type or paste some text before refining.", true);
    return;
  }

  setStatus("Refining...", false);

  try {
    const payload = { refinement: task, text };
    if (selectedModel) {
      payload.model = selectedModel;
    }
    if (wordLimit && Number.isFinite(wordLimit)) {
      payload.maxWords = Number(wordLimit);
    }
    if (selectedTone) {
      payload.tone = selectedTone;
    }
    if (selectedStyle) {
      payload.style = selectedStyle;
    }
    if (selectedAudience) {
      payload.audience = selectedAudience;
    }
    if (selectedPurpose) {
      payload.purpose = selectedPurpose;
    }

    const response = await fetch(API_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`${response.status} ${response.statusText}: ${errorText}`);
    }

    const responseData = await response.json();
    const refined = (responseData?.choices?.[0]?.message?.content) || responseData?.result || "";
    if (!refined) {
      throw new Error("No refined text received from the backend");
    }

    textarea.value = refined;
    updateCount(refined);
    setStatus("Refinement complete. Click Apply to replace the text.", false);
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, true);
  }
}

function updateCount(text) {
  if (!popup) return;
  const countEl = popup.querySelector("#ai-text-refiner-count");
  if (!countEl) return;

  const charCount = text.length;
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  countEl.textContent = `Words: ${wordCount} · Characters: ${charCount}`;
}

function applyResult() {
  if (!popup || !activeElement) return;
  const textarea = popup.querySelector("#ai-text-refiner-input");
  setTextToElement(activeElement, textarea.value);
  closePopup();
}

function onKeydown(e) {
  if (e.key !== REFINE_SHORTCUT_KEY) return;
  if (!isEditable(e.target)) return;

  const hasModifier = e.ctrlKey || e.metaKey;
  if (requireModifierShortcut && !hasModifier) return;

  // Prevent the backslash from being inserted into the focused field when this key opens the popup.
  e.preventDefault();
  openPopupForElement(e.target, e);
}

function onClick(e) {
  // Close popup if click happens outside of it and it exists.
  if (!popup) return;
  if (popup.contains(e.target)) return;
  closePopup();
}


window.addEventListener("keydown", onKeydown, true);
window.addEventListener("mousedown", onClick, true);
