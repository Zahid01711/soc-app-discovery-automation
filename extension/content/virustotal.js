(function () {
  if (window.__SOC_ADA_vt__) return;
  window.__SOC_ADA_vt__ = true;

  function extract() {
    const text = document.body?.innerText ?? "";
    const domain = location.pathname.split("/").pop() || "";

    const malicious = text.match(/(\d+)\s*\/\s*(\d+)\s*security vendors/i);
    if (malicious) {
      const bad = parseInt(malicious[1], 10);
      const total = parseInt(malicious[2], 10);
      if (bad === 0) return { summary: `Clean — 0/${total} vendors flagged`, status: "clean" };
      return { summary: `${bad}/${total} vendors flagged malicious`, status: "flagged" };
    }

    if (/harmless|clean|no security vendors flagged/i.test(text)) {
      return { summary: "Clean — no vendors flagged", status: "clean" };
    }

    if (/malicious/i.test(text)) {
      return { summary: "Review — malicious detections present", status: "flagged" };
    }

    return { summary: "Checked — see VirusTotal tab", status: "unknown" };
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === "VT_EXTRACT") sendResponse({ ok: true, ...extract() });
    return true;
  });
})();
