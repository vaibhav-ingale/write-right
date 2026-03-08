# Privacy Policy for WriteRight

Last updated: March 8, 2026

This Privacy Policy describes how the WriteRight Chrome extension and its backend handle data.

## Summary

WriteRight helps users refine text in editable fields. It runs locally in the browser and sends text only when the user triggers refinement.

## Data We Process

1. User-provided text
- The extension reads text from the active editable element only when the user activates WriteRight.
- That text is sent to the configured backend endpoint to generate a refined result.

2. Local settings saved in Chrome storage
- `backendEndpoint`
- `requireModifierShortcut`
- `selectedModel`
- `wordLimit`

3. Operational error details
- Basic technical errors may appear in browser extension logs/console for debugging.

## How We Use Data

1. To refine text and return a result to the user.
2. To remember extension preferences.
3. To diagnose technical failures.

## Where Data Is Sent

1. Backend endpoint configured by the user (default: `http://localhost:8000`).
2. The backend may forward requests to an OpenAI-compatible LLM endpoint configured by the user (for example Ollama/LM Studio/LLM Gateway).

If you configure a non-local or third-party endpoint, your text is handled by that endpoint under its own privacy policy and terms.

## What We Do Not Do

1. We do not sell personal data.
2. We do not use advertising trackers.
3. We do not run analytics/telemetry services from the extension code.
4. We do not require user accounts.

## Retention

1. Extension settings are stored locally until you change them or uninstall the extension.
2. Text in the refinement popup is temporary in-memory UI state.
3. Any retention at your configured backend/LLM endpoint is controlled by that service.

## Permissions and Why They Are Needed

1. `storage`: Save user settings (endpoint, shortcut mode, model, word limit).
2. `scripting` and content script access: Detect/edit active text fields when users trigger WriteRight.
3. Host permissions (`http://localhost:8000/*`, `http://127.0.0.1:8000/*`): Call local backend APIs.

## Your Choices

1. You can set your own backend endpoint.
2. You can stop usage anytime by disabling or uninstalling the extension.
3. You can clear extension data from Chrome extension settings.

## Children

WriteRight is not intended for children under 13.

## Changes to This Policy

This policy may be updated from time to time. The "Last updated" date reflects the latest revision.

## Contact

For privacy questions, contact the extension publisher using the support contact listed in the Chrome Web Store listing.
