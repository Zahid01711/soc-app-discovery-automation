(function () {
  function extract() {
    const text = document.body?.innerText ?? "";

    const score = text.match(/Web Reputation Score[^\d]*(-?\d+)/i) ||
      text.match(/Reputation Score[^\d]*(-?\d+)/i) ||
      text.match(/Score[^\d]*(-?\d+)/i);

    const category =
      matchLine(text, "Category") ||
      matchLine(text, "Web Category") ||
      "";

    if (score) {
      const n = parseInt(score[1], 10);
      let label = "Neutral";
      if (n >= 1) label = "Favorable";
      if (n <= -1) label = "Questionable/Poor";
      return { summary: `Score ${n} — ${label}${category ? ` — ${category}` : ""}`, score: n };
    }

    if (/neutral/i.test(text)) return { summary: "Neutral", score: 0 };
    if (/uncommon/i.test(text)) return { summary: "Uncommon", score: null };

    return { summary: "Checked — see Talos tab", score: null };
  }

  function matchLine(text, label) {
    const re = new RegExp(`${label}\\s*[:\\n]\\s*([^\\n]+)`, "i");
    return text.match(re)?.[1]?.trim() ?? "";
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === "TALOS_EXTRACT") sendResponse({ ok: true, ...extract() });
    return true;
  });
})();
