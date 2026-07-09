/** Retry tab messages — content scripts sometimes load after page complete. */

const CONTENT_SCRIPTS = {
  "dashboard.umbrella.com": "content/umbrella.js",
  "www.virustotal.com": "content/virustotal.js",
  "talosintelligence.com": "content/talos.js",
  "xdr.us.security.cisco.com": "content/xdr.js",
  "xdr.security.cisco.com": "content/xdr.js",
  "docs.google.com": "content/notebook.js",
  "gemini.google.com": "content/gemini.js",
};

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function scriptForUrl(url) {
  try {
    const host = new URL(url).hostname;
    for (const [pattern, file] of Object.entries(CONTENT_SCRIPTS)) {
      if (host.includes(pattern) || host === pattern) return file;
    }
  } catch {
    /* ignore */
  }
  return null;
}

async function injectContentScript(tabId, url) {
  const file = scriptForUrl(url);
  if (!file) return false;
  try {
    await chrome.scripting.executeScript({ target: { tabId }, files: [file] });
    await sleep(400);
    return true;
  } catch {
    return false;
  }
}

async function pingTab(tabId) {
  try {
    const res = await chrome.tabs.sendMessage(tabId, { type: "PING" });
    return res?.ok === true;
  } catch {
    return false;
  }
}

export async function ensureTabReady(tabId, url, maxWaitMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (await pingTab(tabId)) return true;
    if (url) await injectContentScript(tabId, url);
    await sleep(600);
  }
  return pingTab(tabId);
}

export async function sendTabMessage(tabId, type, payload = {}, retries = 6) {
  let lastError;
  let tabUrl = "";

  try {
    const tab = await chrome.tabs.get(tabId);
    tabUrl = tab.url || "";
  } catch {
    /* tab gone */
  }

  for (let i = 0; i < retries; i++) {
    try {
      const res = await chrome.tabs.sendMessage(tabId, { type, ...payload });
      if (res !== undefined) return res;
    } catch (err) {
      lastError = err;
      if (tabUrl) await injectContentScript(tabId, tabUrl);
      await sleep(700 + i * 350);
    }
  }

  throw new Error(
    lastError?.message?.includes("Receiving end")
      ? "Page not ready — refresh that tab and try again."
      : lastError?.message || "Could not reach page script."
  );
}

export function waitForTabLoad(tabId, timeoutMs = 90000) {
  return new Promise((resolve, reject) => {
    let settled = false;

    const done = () => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      clearTimeout(timer);
      resolve();
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error("Page load timed out — Umbrella/XDR may still be loading; try again."));
    }, timeoutMs);

    const onUpdated = (id, info) => {
      if (id === tabId && info.status === "complete") done();
    };

    chrome.tabs.get(tabId).then((tab) => {
      if (tab.status === "complete") done();
      else chrome.tabs.onUpdated.addListener(onUpdated);
    }).catch(() => {
      chrome.tabs.onUpdated.addListener(onUpdated);
    });
  });
}

export async function withBackgroundTab(url, fn, options = {}) {
  const { minReadyMs = 2500, maxReadyMs = 15000 } = options;
  const tab = await chrome.tabs.create({ url, active: false });
  try {
    await waitForTabLoad(tab.id);
    await ensureTabReady(tab.id, url, maxReadyMs);
    await sleep(minReadyMs);
    return await fn(tab.id);
  } finally {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      /* tab closed */
    }
  }
}
