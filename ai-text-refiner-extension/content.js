// AI Text Refiner content script
// Listens for `\` (backslash) key while focus is inside editable element, then shows a floating UI.

const REFINE_SHORTCUT_KEY = "\\";
const API_ENDPOINT = "http://localhost:8000/v1/chat/completions";

let activeElement = null;
let popup = null;
let currentText = "";
let requireModifierShortcut = true; // can be toggled via the extension popup
let selectedModel = "";

function loadSettings() {
  if (!chrome?.storage?.local) return;
  chrome.storage.local.get({ requireModifierShortcut: true, selectedModel: "" }, (data) => {
    requireModifierShortcut = data.requireModifierShortcut;
    selectedModel = data.selectedModel || "";
  });
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

function createPopup() {
  const wrapper = document.createElement("div");
  wrapper.id = "ai-text-refiner-popup";
  wrapper.style.position = "fixed";
  wrapper.style.zIndex = "999999";
  wrapper.style.minWidth = "320px";
  wrapper.style.maxWidth = "420px";
  wrapper.style.background = "rgba(20, 20, 25, 0.95)";
  wrapper.style.border = "1px solid rgba(255, 255, 255, 0.12)";
  wrapper.style.borderRadius = "12px";
  wrapper.style.boxShadow = "0 10px 50px rgba(0,0,0,0.35)";
  wrapper.style.color = "#fff";
  wrapper.style.fontFamily = "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
  wrapper.style.padding = "10px";
  wrapper.style.backdropFilter = "blur(10px)";
  wrapper.style.transition = "opacity 120ms ease";
  wrapper.style.opacity = "0";
  wrapper.style.maxHeight = "70vh";
  wrapper.style.overflow = "hidden";

  wrapper.innerHTML = `
    <div id="ai-text-refiner-header" style="display:flex; justify-content:space-between; align-items:center; cursor:grab; padding-bottom: 8px;">
      <div style="font-weight:600; font-size:14px;">AI Text Refiner</div>
      <button id="ai-text-refiner-close" style="background:transparent; border:none; color:rgba(255,255,255,0.7); font-size:18px; cursor:pointer;">×</button>
    </div>
    <textarea id="ai-text-refiner-input" style="width:100%; height:140px; resize:vertical; border-radius:8px; border:1px solid rgba(255,255,255,0.18); padding:8px; background:rgba(0,0,0,0.45); color:#fff; outline:none; font-size:13px;" spellcheck="true"></textarea>
    <div id="ai-text-refiner-buttons" style="display:flex; flex-wrap:wrap; gap:6px; padding-top:8px;"></div>
    <div style="display:flex; justify-content:flex-end; margin-top:10px;">
      <button id="ai-text-refiner-apply" style="background:#1f6feb; border:none; color:#fff; padding:8px 14px; border-radius:8px; cursor:pointer; font-weight:600;">Apply Result</button>
    </div>
    <div id="ai-text-refiner-status" style="margin-top:8px; font-size:11px; color:rgba(255,255,255,0.7);"></div>
  `;

  document.body.appendChild(wrapper);
  requestAnimationFrame(() => {
    wrapper.style.opacity = "1";
  });

  const closeBtn = wrapper.querySelector("#ai-text-refiner-close");
  closeBtn.addEventListener("click", () => closePopup());

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
    setStatus("Refinement complete. Click Apply to replace the text.", false);
  } catch (err) {
    console.error(err);
    setStatus(`Error: ${err.message}`, true);
  }
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
