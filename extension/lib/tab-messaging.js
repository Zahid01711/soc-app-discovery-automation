/** Retry tab messages — content scripts sometimes load after page complete. */

export function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function sendTabMessage(tabId, type, payload = {}, retries = 4) {
  let lastError;
  for (let i = 0; i < retries; i++) {
    try {
      return await chrome.tabs.sendMessage(tabId, { type, ...payload });
    } catch (err) {
      lastError = err;
      await sleep(600 + i * 400);
    }
  }
  throw new Error(
    lastError?.message?.includes("Receiving end")
      ? "Page not ready — refresh that tab and try again."
      : lastError?.message || "Could not reach page script."
  );
}

export function waitForTabLoad(tabId, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(fn);
      reject(new Error("Page load timed out"));
    }, timeoutMs);

    const fn = (id, info) => {
      if (id === tabId && info.status === "complete") {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(fn);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(fn);
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
