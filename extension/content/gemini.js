(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function getResponseText() {
    const text = document.body?.innerText || "";
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);

    // Heuristic: grab last large block that looks like model output.
    const candidate = lines.slice(-80).join("\n");
    return candidate.length > 100 ? candidate : "";
  }

  async function runPrompt(promptText) {
    const textbox =
      document.querySelector("div[contenteditable='true']") ||
      document.querySelector("textarea") ||
      document.querySelector("[role='textbox']");

    if (!textbox) {
      return { ok: false, error: "Gemini input box not found." };
    }

    textbox.focus();
    if (textbox.tagName === "TEXTAREA") {
      textbox.value = promptText;
      textbox.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      textbox.textContent = promptText;
      textbox.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    const sendBtn = [...document.querySelectorAll("button")].find((b) =>
      /send|submit|run/i.test((b.textContent || "").trim())
    );

    if (!sendBtn) {
      return { ok: false, error: "Gemini send button not found." };
    }
    sendBtn.click();

    const maxWaitMs = 90000;
    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      await sleep(2500);
      const response = getResponseText();
      if (response) {
        return { ok: true, response };
      }
    }

    return { ok: false, error: "Gemini response timeout." };
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
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
