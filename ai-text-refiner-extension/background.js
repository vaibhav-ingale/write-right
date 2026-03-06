// Background service worker is primarily a pass-through for future messaging needs.
// Currently the content script can call the local API directly, but we keep a minimal
// background worker in case we want to proxy requests or manage persistent state.

chrome.runtime.onInstalled.addListener(() => {
  console.log("Write Right extension installed.");
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "PING") {
    sendResponse({ pong: true });
  }
});
