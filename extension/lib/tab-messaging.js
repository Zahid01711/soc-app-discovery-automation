/** Retry tab messages — inject content scripts when page loads before extension listener is ready. */

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

const SCRIPT_BY_HOST = [
  { test: /dashboard\.umbrella\.com/i, file: "content/umbrella.js" },
  { test: /virustotal\.com/i, file: "content/virustotal.js" },
  { test: /talosintelligence\.com/i, file: "content/talos.js" },
  { test: /xdr\.(us\.)?security\.cisco\.com/i, file: "content/xdr.js" },
  { test: /docs\.google\.com\/spreadsheets/i, file: "content/notebook.js" },
  { test: /gemini\.google\.com/i, file: "content/gemini.js" },
];

function scriptFileForUrl(url) {
  return SCRIPT_BY_HOST.find((e) => e.test.test(url || ""))?.file || null;
}

async function ensureContentScript(tabId) {
  let url = "";
  try {
    const tab = await chrome.tabs.get(tabId);
    url = tab.url || "";
  } catch {
    return;
  }

  const file = scriptFileForUrl(url);
  if (!file) return;

  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    await sleep(300);
  } catch {
    /* already injected or restricted page */
  }
}

export async function sendTabMessage(tabId, type, payload = {}, retries = 5) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type, ...payload });
      if (res !== undefined) return res;
    } catch (err) {
      lastError = err;
      if (err?.message?.includes("Receiving end") || err?.message?.includes("Could not establish")) {
        await ensureContentScript(tabId);
      }
      await sleep(500 + i * 350);
    }
  }
  throw new Error(
    lastError?.message?.includes("Receiving end") || lastError?.message?.includes("Could not establish")
      ? "Page not ready — refresh that tab or reload the extension, then try again."
      : lastError?.message || "Could not reach page script."
  );
}

export function waitForTabLoad(tabId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(fn);
      reject(new Error("Page load timed out — check network or try again."));
    }, timeoutMs);

    const fn = (id, info) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(fn);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(fn);

    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(fn);
        resolve();
      }
    }).catch(() => {});
  });
}

export async function withBackgroundTab(url, fn) {
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabLoad(tab.id);
    await sleep(1500);
    return await fn(tab.id);
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      /* tab closed */
    }
  }
}
