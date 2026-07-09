const $ = (id) => document.getElementById(id);
let isRunning = false;
let pendingXdrTabId = null;

async function send(type, payload = {}) {
  try {
    const res = await chrome.runtime.sendMessage({ type, ...payload });
    if (res === undefined) {
      throw new Error("Extension background not responding — reload extension in chrome://extensions");
    }
    if (res?.ok === false && res?.error) {
      if (res.text || res.results) return res;
      throw new Error(res.error);
    }
    return res;
  } catch (err) {
    if (err.message?.includes("Extension context invalidated")) {
      throw new Error("Extension was reloaded — close and reopen this side panel.");
    }
    throw err;
  }
}

function getXdrMode() {
  return document.querySelector('input[name="xdrMode"]:checked')?.value || "auto";
}

function getWorkflowOptions(extra = {}) {
  const mode = getXdrMode();
  return {
    xdrMode: mode,
    xdrMaxWaitMs: (parseInt($("xdrMaxWaitSec").value, 10) || 120) * 1000,
    enableShaBlocking: $("enableShaBlocking").checked,
    keepUmbrellaTabsOpen: $("keepUmbrellaTabsOpen").checked,
    keepXdrTabOpen: $("keepXdrTabOpen")?.checked || mode === "assist" || mode === "manual",
    enableGoogleAutoAssessment: $("enableGoogleAutoAssessment").checked,
    keepGoogleTabOpen: $("keepGoogleTabOpen").checked,
    analystName: $("analystName").value.trim() || "MD Zahidul Islam",
    stopOnError: $("stopOnError").checked,
    focusXdrTab: mode === "assist",
    ...extra,
  };
}

function setRunning(running) {
  isRunning = running;
  ["runBatchUrls", "runOne", "runListBatch", "pasteNotebook", "queueUrls"].forEach((id) => {
    const el = $(id);
    if (el) el.disabled = running;
  });
  $("statusBadge").textContent = running ? "RUNNING" : $("dryRun").checked ? "DRY-RUN" : "LIVE PASTE";
  $("statusBadge").className = running ? "badge badge-run" : $("dryRun").checked ? "badge badge-warn" : "badge badge-live";
}

function setProgress(text, type = "idle") {
  $("progress").textContent = text;
  $("progressBox").className = "progress-box" + (type !== "idle" ? ` ${type}` : "");
}

function setXdrAlertPending() {
  const el = $("xdrWarning");
  el.className = "alert pending";
  el.textContent = "XDR: scan in progress — wait for completion…";
}

function showManualPanel(show, tabId = null) {
  pendingXdrTabId = tabId;
  $("xdrManualPanel").classList.toggle("hidden", !show);
  $("focusXdrBtn").disabled = !tabId;
}

async function loadSettings() {
  const { settings } = await send("GET_SETTINGS");
  $("dryRun").checked = settings.dryRun !== false;
  $("stopOnError").checked = settings.stopOnError !== false;
  $("enableShaBlocking").checked = !!settings.enableShaBlocking;
  $("autoPasteBatch").checked = !!settings.autoPasteBatch;
  $("keepUmbrellaTabsOpen").checked = settings.keepUmbrellaTabsOpen !== false;
  if ($("keepXdrTabOpen")) $("keepXdrTabOpen").checked = !!settings.keepXdrTabOpen;
  $("enableGoogleAutoAssessment").checked = !!settings.enableGoogleAutoAssessment;
  $("keepGoogleTabOpen").checked = !!settings.keepGoogleTabOpen;
  $("analystName").value = settings.analystName || "MD Zahidul Islam";
  $("xdrMaxWaitSec").value = Math.round((settings.xdrMaxWaitMs || 120000) / 1000);
  const mode = settings.xdrMode || "auto";
  const radio = document.querySelector(`input[name="xdrMode"][value="${mode}"]`);
  if (radio) radio.checked = true;
}

async function saveSettings() {
  await send("SAVE_SETTINGS", {
    settings: {
      dryRun: $("dryRun").checked,
      stopOnError: $("stopOnError").checked,
      enableShaBlocking: $("enableShaBlocking").checked,
      autoPasteBatch: $("autoPasteBatch").checked,
      keepUmbrellaTabsOpen: $("keepUmbrellaTabsOpen").checked,
      keepXdrTabOpen: $("keepXdrTabOpen")?.checked || false,
      enableGoogleAutoAssessment: $("enableGoogleAutoAssessment").checked,
      keepGoogleTabOpen: $("keepGoogleTabOpen").checked,
      analystName: $("analystName").value.trim() || "MD Zahidul Islam",
      xdrMode: getXdrMode(),
      xdrMaxWaitMs: (parseInt($("xdrMaxWaitSec").value, 10) || 120) * 1000,
    },
  });
  await refreshSetup();
  setProgress("Settings saved.", "success");
}

async function refreshSetup() {
  const st = await send("GET_SETUP_STATUS");
  const parts = [];
  if (st.notebookOk) parts.push(`Notebook: ${st.notebookTitle || "OK"}`);
  else parts.push("Notebook: not set");
  parts.push(st.dryRun ? "Dry-run ON" : "Dry-run OFF");
  parts.push(`Queue: ${st.queueLength}`);
  if (st.running) parts.push("RUNNING");
  $("setupStatus").textContent = parts.join(" · ");
  $("setupStatus").className = "setup-status " + (st.notebookOk ? "ok" : "warn");
  $("queueStatus").textContent = `Queue: ${st.queueLength} app(s)`;
  if (st.running) setRunning(true);
}

function confirmShaBlock() {
  if (getXdrMode() !== "auto" || !$("enableShaBlocking").checked) return true;
  return confirm("Auto-block SHA is ON (Automatic mode).\n\nBot will click Block on validated malicious SHA256.\nDomain will NOT be blocked.\n\nContinue?");
}

function formatSummary(s) {
  if (!s || s.success == null || s.total == null) return "";
  return `${s.success}/${s.total} · ${s.shaApps || 0} malicious · ${s.blocked || 0} blocked`;
}

async function runBatchFromQueue() {
  if ($("urlBatch").value.trim()) {
    await send("QUEUE_URLS", { text: $("urlBatch").value });
    await refreshSetup();
  }
  if (!confirmShaBlock()) return;
  await saveSettings();
  setRunning(true);
  showManualPanel(false);
  setXdrAlertPending();
  setProgress("Running batch…", "running");
  $("preview").value = "";
  try {
    const res = await send("RUN_BATCH", { options: { limit: 999, autoPasteBatch: $("autoPasteBatch").checked, ...getWorkflowOptions() } });
    showBatchResult(res);
    const label = res.summary?.stopped ? "Stopped" : "Done";
    setProgress(`${label} — ${formatSummary(res.summary)}`, res.ok === false ? "error" : "success");
  } catch (e) {
    setProgress("FAILED — " + e.message, "error");
  } finally {
    setRunning(false);
    showManualPanel(false);
    await refreshSetup();
  }
}

async function runSingle() {
  if (!confirmShaBlock()) return;
  await saveSettings();
  setRunning(true);
  showManualPanel(false);
  setXdrAlertPending();
  setProgress("Running…", "running");
  $("preview").value = "";
  try {
    const res = await send("RUN_WORKFLOW", {
      options: { openGeminiTab: $("openGemini").checked, autoPaste: false, ...getWorkflowOptions() },
    });
    showOneResult(res);
    setProgress("Complete — review preview.", "success");
  } catch (e) {
    setProgress("FAILED — " + e.message, "error");
  } finally {
    setRunning(false);
    showManualPanel(false);
  }
}

function showOneResult(res) {
  $("preview").value = res.text || "";
  $("preview").scrollTop = 0;
  $("summary").textContent = `${res.app?.appName || "App"} · ${res.app?.xdrSummary || ""}`;
  updateXdrAlert(res);
}

function showBatchResult(res) {
  $("preview").value = res.text || "";
  $("preview").scrollTop = 0;
  const s = res.summary || {};
  const parts = [formatSummary(s)];
  if (s.stopped) parts.push(`stopped at ${s.stoppedAt}`);
  parts.push("Umbrella tabs left open for manual label update");
  $("summary").textContent = parts.filter(Boolean).join(" · ");
  updateXdrAlert({ app: { xdrStatus: s.shaApps ? "malicious_sha" : "clean", shaBlocked: s.blocked ? ["x"] : [] } });
}

function updateXdrAlert(res) {
  const app = res.app || {};
  const el = $("xdrWarning");
  if (app.xdrStatus === "malicious_sha") {
    el.className = "alert warn";
    el.textContent = app.shaBlocked?.length
      ? "Malicious SHA blocked in XDR. Domain not blocked."
      : "Malicious SHA — block in XDR or enable auto-block (Automatic mode).";
  } else if (app.xdrStatus === "uncommon") {
    el.className = "alert ok";
    el.textContent = "XDR: Uncommon — reviewed clean.";
  } else if (app.xdrStatus === "pending") {
    el.className = "alert pending";
    el.textContent = "XDR: scan in progress…";
  } else {
    el.className = "alert ok";
    el.textContent = "XDR: Clean.";
  }
}

async function resolveManualXdr(result) {
  await send("RESOLVE_MANUAL_XDR", { result });
  showManualPanel(false);
  setProgress("XDR decision saved — continuing workflow…", "running");
}

$("xdrManualClean").addEventListener("click", () =>
  resolveManualXdr({ xdrStatus: "clean", summary: "Clean — reviewed manually", maliciousShas: [], analystNotes: "XDR manual: clean." })
);

$("xdrManualUncommon").addEventListener("click", () =>
  resolveManualXdr({ xdrStatus: "uncommon", summary: "Uncommon — reviewed, clean", maliciousShas: [], analystNotes: "XDR manual: uncommon OK." })
);

$("xdrManualMalicious").addEventListener("click", async () => {
  let maliciousShas = [];
  if (pendingXdrTabId) {
    try {
      const ex = await chrome.tabs.sendMessage(pendingXdrTabId, { type: "XDR_EXTRACT" });
      maliciousShas = ex.maliciousShas || [];
    } catch {
      /* user still confirms malicious */
    }
  }
  await resolveManualXdr({
    xdrStatus: "malicious_sha",
    summary: maliciousShas.length ? `Malicious SHA — ${maliciousShas.length} hash(es)` : "Malicious SHA — reviewed manually",
    maliciousShas,
    analystNotes: "XDR manual: malicious SHA — block SHA manually if not auto-blocked.",
  });
});

$("focusXdrBtn").addEventListener("click", async () => {
  if (pendingXdrTabId) await send("FOCUS_XDR_TAB", { tabId: pendingXdrTabId });
});

$("dryRun").addEventListener("change", () => setRunning(isRunning));

$("queueUrls").addEventListener("click", async () => {
  try {
    const res = await send("QUEUE_URLS", { text: $("urlBatch").value });
    await refreshSetup();
    setProgress(`Queued ${res.count} URL(s).`, "success");
  } catch (e) {
    setProgress(e.message, "error");
  }
});

$("runBatchUrls").addEventListener("click", runBatchFromQueue);
$("runOne").addEventListener("click", runSingle);

$("captureList").addEventListener("click", async () => {
  try {
    const res = await send("CAPTURE_LIST");
    await refreshSetup();
    setProgress(`Captured ${res.count} apps.`, "success");
  } catch (e) {
    setProgress(e.message, "error");
  }
});

$("runListBatch").addEventListener("click", async () => {
  if (!confirmShaBlock()) return;
  await saveSettings();
  setRunning(true);
  setXdrAlertPending();
  try {
    const res = await send("RUN_BATCH", {
      options: { limit: parseInt($("batchLimit").value, 10) || 15, autoPasteBatch: $("autoPasteBatch").checked, ...getWorkflowOptions() },
    });
    showBatchResult(res);
    setProgress(`Done — ${formatSummary(res.summary)}`, "success");
  } catch (e) {
    setProgress("FAILED — " + e.message, "error");
  } finally {
    setRunning(false);
  }
});

$("stopBatch").addEventListener("click", async () => {
  await send("STOP_BATCH");
  showManualPanel(false);
  setProgress("Stop requested — finishing current step…", "error");
});

$("copyPreview").addEventListener("click", async () => {
  if (!$("preview").value) return setProgress("Run an app first.", "error");
  await navigator.clipboard.writeText($("preview").value);
  setProgress("Copied.", "success");
});

$("pasteNotebook").addEventListener("click", async () => {
  if ($("dryRun").checked) return setProgress("Turn OFF dry-run first.", "error");
  if (!$("preview").value.trim()) return setProgress("Nothing to paste.", "error");
  if (!confirm("Paste into SOC-Interns cell?")) return;
  try {
    await send("PASTE_TO_NOTEBOOK", { text: $("preview").value, appendBlank: false });
    setProgress("Pasted.", "success");
  } catch (e) {
    setProgress("Paste failed — " + e.message, "error");
  }
});

$("setNotebookTab").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.url?.includes("docs.google.com/spreadsheets")) {
    return setProgress("Open SOC-Interns Google Sheet first.", "error");
  }
  await send("SAVE_SETTINGS", {
    settings: {
      dryRun: $("dryRun").checked,
      notebookTabId: tab.id,
      notebookTitle: tab.title,
    },
  });
  await refreshSetup();
  setProgress(`Notebook: ${tab.title}`, "success");
});

$("saveSettings").addEventListener("click", saveSettings);
$("clearQueue").addEventListener("click", async () => {
  await send("CLEAR_QUEUE");
  await refreshSetup();
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type !== "WORKFLOW_PROGRESS") return;

  if (msg.phase === "xdr_manual") {
    showManualPanel(true, msg.tabId || pendingXdrTabId);
    setProgress("XDR — waiting for your decision (Clean / Uncommon / Malicious)", "running");
    return;
  }

  if (msg.phase === "xdr_scan" || msg.xdrStep === "wait" || (msg.step === "XDR" && /progress|scan|wait/i.test(msg.detail || ""))) {
    setXdrAlertPending();
    setProgress(`XDR: ${msg.detail || msg.step || "scanning…"}`, "running");
    return;
  }

  const label = [msg.step, msg.detail, msg.appName].filter(Boolean).join(" — ");
  setProgress(label || "Working…", "running");

  if (msg.step === "XDR" || msg.step === "VirusTotal" || msg.step === "Talos") {
    setXdrAlertPending();
  }

  if (msg.text) {
    $("preview").value = msg.text;
    $("preview").scrollTop = 0;
    if (msg.summary && msg.summary.success != null) showBatchResult({ text: msg.text, summary: msg.summary });
  }
});

send("RESET_BATCH_STATE").catch(() => {});
loadSettings();
refreshSetup();
