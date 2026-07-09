/**
 * Google Sheets — SOC-Interns notebook (batch + single paste).
 */

(function () {
  const BLOCK_START = "----- APP DISCOVERY -----";

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    try {
      if (msg.type === "PING") {
        sendResponse({ ok: true, page: "notebook" });
        return true;
      }
      if (msg.type === "PASTE_ENTRY" || msg.type === "PASTE_BATCH") {
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
    cell.click?.();

    const existing = getCellText(cell);
    let payload = text.trim();

    if (existing.trim() && !existing.includes(BLOCK_START)) {
      payload = existing.trimEnd() + "\n\n" + payload;
    }

    insertText(cell, payload);
    commitEdit(cell);

    return {
      pasted: true,
      chars: payload.length,
      blocks: (payload.match(/----- APP DISCOVERY -----/g) || []).length,
    };
  }

  function getActiveCellInput() {
    const selectors = [
      "#t-formula-bar-input",
      ".cell-input",
      "div.cell-input",
      "[contenteditable='true'][role='textbox']",
      "[contenteditable='true']",
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el && isVisible(el)) return el;
    }
    return null;
  }

  function isVisible(el) {
    const r = el.getBoundingClientRect?.();
    return !r || (r.width > 0 && r.height > 0);
  }

  function getCellText(el) {
    if (el.isContentEditable) return el.textContent || el.innerText || "";
    return el.value || "";
  }

  function insertText(el, text) {
    if (el.isContentEditable) {
      el.focus();
      if (document.queryCommandSupported?.("selectAll")) {
        document.execCommand("selectAll", false, null);
      }
      if (document.queryCommandSupported?.("insertText")) {
        document.execCommand("insertText", false, text);
      } else {
        el.textContent = text;
        el.dispatchEvent(new InputEvent("input", { bubbles: true, data: text, inputType: "insertText" }));
      }
    } else {
      el.value = text;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function commitEdit(el) {
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
    el.dispatchEvent(new KeyboardEvent("keyup", { key: "Enter", code: "Enter", keyCode: 13, bubbles: true }));
  }
})();
