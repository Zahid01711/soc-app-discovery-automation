/**
 * Google Sheets — SOC-Interns notebook (batch + single paste).
 */

(function () {
  const BLOCK_START = "----- APP DISCOVERY -----";

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    try {
      if (msg.type === "PASTE_ENTRY") {
        sendResponse({ ok: true, ...pasteBlock(msg.text, msg.appendBlank !== false) });
      } else if (msg.type === "PASTE_BATCH") {
        sendResponse({ ok: true, ...pasteBlock(msg.text, msg.appendBlank !== false) });
      } else if (msg.type === "NOTEBOOK_READY") {
        sendResponse({ ok: true, title: document.title, url: location.href });
      } else {
        sendResponse({ ok: false, error: "Unknown message" });
      }
    } catch (err) {
      sendResponse({ ok: false, error: err.message });
    }
    return true;
  });

  function pasteBlock(text, appendBlank) {
    if (!text?.trim()) throw new Error("Nothing to paste — workflow produced empty text.");

    const cell = getActiveCellInput();
    if (!cell) {
      throw new Error(
        "Click the cell in SOC-Interns sheet where the FIRST entry should go, then run paste again."
      );
    }

    cell.focus();
    const existing = getCellText(cell);
    let payload = text;

    if (existing.trim() && !existing.includes(BLOCK_START)) {
      payload = existing.trimEnd() + "\n\n" + text;
    }

    insertText(cell, payload);
    commitEdit(cell);

    return { pasted: true, chars: payload.length, blocks: (text.match(/----- APP DISCOVERY -----/g) || []).length };
  }

  function getActiveCellInput() {
    return (
      document.querySelector("#t-formula-bar-input") ||
      document.querySelector(".cell-input") ||
      document.querySelector("[contenteditable='true']")
    );
  }

  function getCellText(el) {
    if (el.isContentEditable) return el.textContent || "";
    return el.value || "";
  }

  function insertText(el, text) {
    if (el.isContentEditable) {
      el.textContent = text;
      el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text }));
    } else {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function commitEdit(el) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", bubbles: true }));
  }
})();
