import {
  runAppWorkflow,
  runBatchWorkflow,
  resolveManualXdr,
  getPendingManualXdr,
} from "../lib/workflow-engine.js";
import { parseUmbrellaUrls } from "../lib/validate.js";
import { renderBatch } from "../lib/template.js";
import { buildToolUrls } from "../lib/links.js";
import { sendTabMessage, waitForTabLoad, sleep } from "../lib/tab-messaging.js";

const DEFAULT_SETTINGS = {
  dryRun: true,
  enableShaBlocking: false,
  stopOnError: true,
  autoPasteBatch: false,
  dailyTarget: 15,
  notebookTabId: null,
  notebookTitle: "",
  waitMs: 3500,
  xdrMode: "auto",
  xdrMaxWaitMs: 120000,
  focusXdrTab: false,
  actionLog: [],
};

let batchState = { running: false, paused: false, queue: [] };

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
  chrome.storage.local.get("settings", ({ settings }) => {
    if (!settings) chrome.storage.local.set({ settings: DEFAULT_SETTINGS });
  });
});

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  handleMessage(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message }));
  return true;
});

async function handleMessage(msg) {
  switch (msg.type) {
    case "GET_SETTINGS":
      return { ok: true, settings: await getSettings() };
    case "GET_SETUP_STATUS":
      return getSetupStatus();
    case "SAVE_SETTINGS":
      await chrome.storage.local.set({ settings: { ...(await getSettings()), ...msg.settings } });
      return { ok: true };
    case "EXTRACT_CURRENT_APP":
      return extractFromUmbrellaTab();
    case "CAPTURE_LIST":
      return captureList();
    case "QUEUE_URLS":
      return queueUrls(msg.text);
    case "GET_QUEUE":
      return { ok: true, queue: batchState.queue, running: batchState.running };
    case "CLEAR_QUEUE":
      batchState.queue = [];
      return { ok: true };
    case "RUN_WORKFLOW":
      return runOne(msg.options || {});
    case "RUN_BATCH":
      return runBatch(msg.options || {});
    case "STOP_BATCH":
      batchState.running = false;
      return { ok: true };
    case "PASTE_TO_NOTEBOOK":
      return pasteToNotebook(msg.text, msg.appendBlank !== false);
    case "RESOLVE_MANUAL_XDR":
      if (!resolveManualXdr(msg.result)) {
        return { ok: false, error: "No XDR review waiting — start a workflow first." };
      }
      return { ok: true };
    case "GET_PENDING_MANUAL_XDR":
      return { ok: true, pending: getPendingManualXdr() };
    case "FOCUS_XDR_TAB":
      if (msg.tabId) {
        await chrome.tabs.update(msg.tabId, { active: true });
        return { ok: true };
      }
      return { ok: false, error: "No tab id" };
    default:
      if (msg.type === "XDR_PROGRESS") {
        emitProgress({ step: "XDR", detail: msg.detail, phase: "xdr_scan", xdrStep: msg.step });
        return { ok: true };
      }
      return { ok: false, error: `Unknown: ${msg.type}` };
  }
}

async function getSettings() {
  const { settings } = await chrome.storage.local.get("settings");
  return { ...DEFAULT_SETTINGS, ...settings };
}

async function getSetupStatus() {
  const settings = await getSettings();
  let notebookOk = false;
  let notebookTitle = settings.notebookTitle || "";

  if (settings.notebookTabId) {
    try {
      const tab = await chrome.tabs.get(settings.notebookTabId);
      notebookOk = !!tab?.id;
      notebookTitle = tab?.title || notebookTitle;
    } catch {
      notebookOk = false;
    }
  }

  if (!notebookOk) {
    const tabs = await chrome.tabs.query({ url: "https://docs.google.com/spreadsheets/*" });
    const soc = tabs.find((t) => /soc-intern/i.test(t.title || ""));
    if (soc) {
      notebookOk = true;
      notebookTitle = soc.title;
    }
  }

  return {
    ok: true,
    dryRun: settings.dryRun !== false,
    notebookOk,
    notebookTitle,
    queueLength: batchState.queue.length,
    running: batchState.running,
  };
}

function makeCtx(settings, options = {}) {
  return {
    sendTab: sendTabMessage,
    openTab: (url, active) => chrome.tabs.create({ url, active: !!active }),
    closeTab: (id) => chrome.tabs.remove(id),
    waitLoad: waitForTabLoad,
    sleep,
    waitMs: options.waitMs || settings.waitMs,
    enableShaBlocking: options.enableShaBlocking ?? settings.enableShaBlocking,
    xdrMode: options.xdrMode ?? settings.xdrMode ?? "auto",
    xdrMaxWaitMs: options.xdrMaxWaitMs ?? settings.xdrMaxWaitMs ?? 120000,
    focusXdrTab: options.focusXdrTab ?? settings.focusXdrTab ?? false,
    stopOnError: options.stopOnError ?? settings.stopOnError,
    shouldStop: () => !batchState.running,
    shouldPause: () => batchState.paused,
    onProgress: (step, app, detail) => {
      const pending = getPendingManualXdr();
      emitProgress({
        step,
        detail,
        appName: app?.appName,
        phase: step === "XDR manual" ? "xdr_manual" : "step",
        tabId: pending?.tabId,
      });
    },
    onBatchProgress: (n, total, app) =>
      emitProgress({ step: `App ${n} of ${total}`, appName: app?.appName, phase: "batch", index: n, total }),
  };
}

async function extractFromUmbrellaTab() {
  const tab = await getActiveTab();
  const res = await sendTabMessage(tab.id, "EXTRACT_DETAIL");
  if (!res?.ok) throw new Error(res?.error || "Open an Umbrella App Discovery detail page first.");
  return { ok: true, app: res.app };
}

async function captureList() {
  const tab = await getActiveTab();
  const res = await sendTabMessage(tab.id, "EXTRACT_LIST");
  if (!res?.ok) throw new Error(res?.error || "Open the App Discovery list in Umbrella.");
  batchState.queue = res.apps;
  return { ok: true, count: res.apps.length, apps: res.apps };
}

function queueUrls(text) {
  const { urls, invalid } = parseUmbrellaUrls(text);
  if (urls.length === 0) {
    throw new Error("No valid URLs. Each line must be a Cisco Umbrella App Discovery app link.");
  }
  batchState.queue = urls;
  return { ok: true, count: urls.length, invalid, urls };
}

async function runOne(options) {
  if (batchState.running) throw new Error("Batch already running — wait or click Stop.");
  const settings = await getSettings();
  let app = options.app;

  if (!app) {
    app = (await extractFromUmbrellaTab()).app;
  }

  batchState.running = true;
  try {
    const result = await runAppWorkflow(app, makeCtx(settings, options));

    if (options.openGeminiTab) {
      await chrome.tabs.create({ url: buildToolUrls(app.appUrl).geminiUrl, active: false });
    }

    if (!settings.dryRun && options.autoPaste) {
      await pasteToNotebook(result.text, true);
    }

    emitProgress({ step: "Complete", detail: result.app.appName, text: result.text, phase: "done" });
    return result;
  } finally {
    batchState.running = false;
  }
}

async function runBatch(options) {
  if (batchState.queue.length === 0) {
    throw new Error("Queue is empty — paste Umbrella URLs or capture from list first.");
  }
  if (batchState.running) throw new Error("Already running.");

  const settings = await getSettings();
  batchState.running = true;

  const limit = options.limit || batchState.queue.length;
  const apps = batchState.queue.slice(0, limit);

  try {
    const batchResult = await runBatchWorkflow(apps, makeCtx(settings, options));
    const combinedText = renderBatch(batchResult.results, true);
    const summary = {
      total: apps.length,
      success: batchResult.results.length,
      failed: batchResult.errors.length,
      shaApps: batchResult.results.filter((r) => r.app?.xdrStatus === "malicious_sha").length,
      blocked: batchResult.results.reduce((n, r) => n + (r.app?.shaBlocked?.length || 0), 0),
    };

    if (!settings.dryRun && options.autoPasteBatch) {
      await pasteToNotebook(combinedText, false);
      summary.pasted = true;
    }

    emitProgress({ step: "Batch complete", detail: `${summary.success}/${summary.total} apps`, text: combinedText, summary, phase: "done" });

    return { ok: true, text: combinedText, results: batchResult.results, errors: batchResult.errors, summary };
  } finally {
    batchState.running = false;
  }
}

async function pasteToNotebook(text, appendBlank) {
  const settings = await getSettings();
  if (settings.dryRun) {
    throw new Error("Dry-run is ON. Turn it off in Safety Settings before pasting.");
  }
  if (!text?.trim()) throw new Error("Nothing to paste — run workflow first.");

  const tabId = await resolveNotebookTab(settings);
  const res = await sendTabMessage(tabId, "PASTE_BATCH", { text, appendBlank });
  if (!res?.ok) throw new Error(res?.error || "Paste failed.");
  await logAction({ action: "pasted", chars: text.length });
  return res;
}

async function resolveNotebookTab(settings) {
  if (settings.notebookTabId) {
    try {
      await chrome.tabs.get(settings.notebookTabId);
      return settings.notebookTabId;
    } catch {
      /* closed */
    }
  }
  const tabs = await chrome.tabs.query({ url: "https://docs.google.com/spreadsheets/*" });
  const soc = tabs.find((t) => /soc-intern/i.test(t.title || ""));
  const tabId = soc?.id || tabs[0]?.id;
  if (!tabId) {
    throw new Error("Open SOC-Interns Google Sheet, click the target cell, then click “Save notebook tab”.");
  }
  return tabId;
}

async function logAction(entry) {
  const s = await getSettings();
  const log = [...(s.actionLog || []), { ...entry, at: new Date().toISOString() }].slice(-50);
  await chrome.storage.local.set({ settings: { ...s, actionLog: log } });
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) throw new Error("No active browser tab.");
  return tab;
}

function emitProgress(data) {
  chrome.runtime.sendMessage({ type: "WORKFLOW_PROGRESS", ...data }).catch(() => {});
}
