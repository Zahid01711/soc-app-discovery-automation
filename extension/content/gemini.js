(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getResponseText(promptText) {
    const text = document.body?.innerText || "";
    let cleaned = text;
    if (promptText) {
      const firstLine = promptText.split("\n")[0];
      const idx = cleaned.indexOf(firstLine);
      if (idx >= 0) cleaned = cleaned.slice(idx + promptText.length);
    }

    const lines = cleaned
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^Gemini$/i.test(l) && !/^Google$/i.test(l));

    const tail = lines.slice(-40).join("\n");
    if (tail.length < 80) return "";
    if (promptText && tail.includes(promptText.slice(0, 40))) return "";
    return tail;
  }

  async function runPrompt(promptText) {
    const textbox =
      document.querySelector("div[contenteditable='true'][role='textbox']") ||
      document.querySelector("div[contenteditable='true']") ||
      document.querySelector("textarea") ||
      document.querySelector("[role='textbox']");

    if (!textbox) {
      return { ok: false, error: "Gemini input box not found — log in to gemini.google.com first." };
    }

    textbox.focus();
    if (textbox.tagName === "TEXTAREA") {
      textbox.value = promptText;
      textbox.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      textbox.textContent = promptText;
      textbox.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    const sendBtn = [...document.querySelectorAll("button")].find((b) => {
      const label = (b.getAttribute("aria-label") || b.textContent || "").trim();
      return /send|submit|run/i.test(label);
    });

    if (!sendBtn) {
      return { ok: false, error: "Gemini send button not found." };
    }
    sendBtn.click();

    const maxWaitMs = 90000;
    const start = Date.now();
    let lastLen = 0;
    let stable = 0;

    while (Date.now() - start < maxWaitMs) {
      await sleep(2500);
      const response = getResponseText(promptText);
      if (response.length > 100) {
        if (response.length === lastLen) stable += 1;
        else stable = 0;
        lastLen = response.length;
        if (stable >= 2) return { ok: true, response };
      }
    }

    const fallback = getResponseText(promptText);
    if (fallback) return { ok: true, response: fallback };
    return { ok: false, error: "Gemini response timeout — try opening Gemini manually." };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "PING") {
      sendResponse({ ok: true, page: "gemini" });
      return true;
    }
    if (msg.type === "GEMINI_RUN_PROMPT") {
      runPrompt(msg.prompt || "").then(sendResponse);
      return true;
    }
    if (msg.type === "GEMINI_EXTRACT") {
      sendResponse({ ok: true, response: getResponseText() });
      return true;
    }
    return true;
  });
})();
