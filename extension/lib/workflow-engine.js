import { workflowDate } from "./date.js";
import { validateUmbrellaApp, validateWorkflowResult } from "./validate.js";
import { renderEntry, inferRecommendedLabel } from "./template.js";
import { buildToolUrls } from "./links.js";
import { sendTabMessage, sleep, withBackgroundTab } from "./tab-messaging.js";

const STEP = {
  UMBRELLA: "Umbrella",
  VT: "VirusTotal",
  TALOS: "Talos",
  XDR: "XDR",
  XDR_BLOCK: "XDR block",
  XDR_MANUAL: "XDR manual",
  DONE: "Done",
};

/** @type {{ resolve: Function, tabId: number, app: object } | null} */
let pendingManualXdr = null;

export function resolveManualXdr(result) {
  if (!pendingManualXdr) return false;
  pendingManualXdr.resolve(result);
  pendingManualXdr = null;
  return true;
}

export function getPendingManualXdr() {
  return pendingManualXdr ? { tabId: pendingManualXdr.tabId, appName: pendingManualXdr.app?.appName } : null;
}

function waitForManualDecision(tabId, app, onProgress) {
  return new Promise((resolve) => {
    pendingManualXdr = { resolve, tabId, app };
    onProgress?.(STEP.XDR_MANUAL, "Waiting for your decision in the side panel…");
  });
}

async function extractWithRetry(tabId, retries = 3) {
  for (let i = 0; i < retries; i++) {
    const detail = await sendTabMessage(tabId, "EXTRACT_DETAIL");
    if (detail?.ok && detail.app?.appUrl) return detail;
    await sleep(1500);
  }
  return sendTabMessage(tabId, "EXTRACT_DETAIL");
}

async function readExternalCheck(tabId, messageType, label) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await sendTabMessage(tabId, messageType).catch(() => null);
    if (res?.summary) return res;
    await sleep(1200);
  }
  throw new Error(`${label}: could not read result — page may still be loading`);
}

async function runXdrPhase(app, ctx) {
  const {
    xdrMode = "auto",
    enableShaBlocking = false,
    xdrMaxWaitMs = 120000,
    focusXdrTab = false,
    onProgress,
    focusTab,
    closeTab,
  } = ctx;

  const links = buildToolUrls(app.appUrl);
  const xdrTab = await ctx.openTab(links.xdrInvestigateUrl, false);
  await ctx.waitLoad(xdrTab.id);
  await sleep(2000);

  app.shaBlocked = [];
  app.shaBlockFailed = [];
  app.xdrMode = xdrMode;

  // --- MANUAL: paste URL, switch to XDR, user decides ---
  if (xdrMode === "manual") {
    onProgress?.(STEP.XDR, "Pasting URL — switch to XDR and review…");
    const inv = await sendTabMessage(xdrTab.id, "XDR_INVESTIGATE", { searchUrl: app.appUrl });
    if (!inv?.ok) {
      await closeTab?.(xdrTab.id);
      throw new Error(`XDR: ${inv?.error || "could not start investigation"}`);
    }

    await focusTab?.(xdrTab.id);
    onProgress?.(STEP.XDR_MANUAL, "Review XDR scan, then pick Clean / Uncommon / Malicious below");

    const manual = await waitForManualDecision(xdrTab.id, app, onProgress);
    app.xdrStatus = manual.xdrStatus || "clean";
    app.maliciousShas = manual.maliciousShas || [];
    app.xdrSummary = manual.summary || manual.xdrStatus;
    app.shaBlocked = manual.shaBlocked || [];
    app.analystNotes = manual.analystNotes || "";

    if (!ctx.keepXdrTabOpen) await closeTab?.(xdrTab.id);
    return;
  }

  // --- AUTO or ASSIST (assist = show XDR tab while bot works) ---
  if (xdrMode === "assist" || focusXdrTab) {
    await focusTab?.(xdrTab.id);
    onProgress?.(STEP.XDR, "XDR tab open — watch scan (bot will wait until complete)…");
  } else {
    onProgress?.(STEP.XDR, "Running XDR scan in background (may take 1–2 min)…");
  }

  const pipeline = await sendTabMessage(xdrTab.id, "XDR_RUN_PIPELINE", {
    searchUrl: app.appUrl,
    domain: links.domain,
    enableShaBlocking: enableShaBlocking && xdrMode === "auto",
    maxWaitMs: xdrMaxWaitMs,
  });

  if (!pipeline?.ok) {
    await closeTab?.(xdrTab.id);
    throw new Error(`XDR: ${pipeline?.error || "pipeline failed"}`);
  }

  app.xdrStatus = pipeline.xdrStatus || "clean";
  app.maliciousShas = pipeline.maliciousShas || [];
  app.xdrSummary = pipeline.summary;
  app.shaBlocked = pipeline.shaBlocked || pipeline.blockReport?.blocked || [];
  app.shaBlockFailed = pipeline.shaBlockFailed || pipeline.blockReport?.failed || [];
  app.xdrValidation = pipeline.validation;

  onProgress?.(STEP.XDR, pipeline.summary);

  if (app.xdrStatus === "malicious_sha" && app.maliciousShas.length && !enableShaBlocking) {
    onProgress?.(STEP.XDR_BLOCK, "Malicious SHA found — auto-block off (block manually or enable in settings)");
  } else if (app.shaBlocked?.length) {
    onProgress?.(STEP.XDR_BLOCK, `Blocked ${app.shaBlocked.length} SHA in XDR`);
  }

  if (!ctx.keepXdrTabOpen) await closeTab?.(xdrTab.id);
}

export async function runAppWorkflow(app, ctx) {
  const { waitMs = 3500, onProgress } = ctx;

  app.date = workflowDate();
  const log = { steps: [], appName: app.appName };

  const progress = (step, detail) => {
    log.steps.push({ step, detail, at: Date.now() });
    onProgress?.(step, app, detail);
  };

  if (app.detailUrl) {
    progress(STEP.UMBRELLA, "Loading app page…");
    const tab = await ctx.openTab(app.detailUrl, false);
    await ctx.waitLoad(tab.id);
    await sleep(2500);
    const detail = await extractWithRetry(tab.id);
    await ctx.closeTab?.(tab.id);
    if (!detail?.ok) throw new Error(`Umbrella: ${detail?.error || "extract failed"}`);
    Object.assign(app, detail.app);
    app.date = workflowDate();
  }

  const v = validateUmbrellaApp(app);
  if (!v.valid) throw new Error(`Umbrella: ${v.errors.join("; ")}`);
  progress(STEP.UMBRELLA, `OK — ${app.appName}`);

  const links = buildToolUrls(app.appUrl);

  progress(STEP.VT, "Checking domain…");
  const vt = await withBackgroundTab(links.virusTotalUrl, async (tabId) => {
    await sleep(waitMs);
    return readExternalCheck(tabId, "VT_EXTRACT", "VirusTotal");
  });
  app.virusTotalSummary = vt.summary;
  progress(STEP.VT, vt.summary);

  progress(STEP.TALOS, "Checking reputation…");
  const talos = await withBackgroundTab(links.talosUrl, async (tabId) => {
    await sleep(waitMs);
    return readExternalCheck(tabId, "TALOS_EXTRACT", "Talos");
  });
  app.talosSummary = talos.summary;
  progress(STEP.TALOS, talos.summary);

  await runXdrPhase(app, {
    ...ctx,
    onProgress: progress,
    focusTab: (tabId) => chrome.tabs.update(tabId, { active: true }),
    closeTab: ctx.closeTab,
  });

  app.recommendedLabel = inferRecommendedLabel(app);
  if (!app.analystNotes) app.analystNotes = buildAnalystNotes(app);

  const text = renderEntry(app);
  const result = {
    ok: true,
    app,
    text,
    log,
    xdrRequiresManualBlock: app.xdrStatus === "malicious_sha" && !app.shaBlocked?.length,
  };

  const rv = validateWorkflowResult(result);
  if (!rv.valid) throw new Error(rv.errors.join("; "));

  progress(STEP.DONE, app.appName);
  return result;
}

function buildAnalystNotes(app) {
  const parts = [];
  if (app.xdrStatus === "clean") parts.push("Domain clean in XDR.");
  if (app.xdrStatus === "uncommon") parts.push("Uncommon but reviewed clean.");
  if (app.shaBlocked?.length) parts.push(`Blocked ${app.shaBlocked.length} SHA256 in XDR.`);
  if (app.shaBlockFailed?.length) parts.push(`Manual block needed for ${app.shaBlockFailed.length} SHA.`);
  if (app.xdrMode === "manual") parts.push("XDR reviewed manually.");
  return parts.join(" ") || "";
}

export async function runBatchWorkflow(apps, ctx) {
  const results = [];
  const errors = [];

  for (let i = 0; i < apps.length; i++) {
    if (ctx.shouldStop?.()) break;
    while (ctx.shouldPause?.()) await sleep(400);

    const app = { ...apps[i] };
    ctx.onBatchProgress?.(i + 1, apps.length, app);

    try {
      results.push(await runAppWorkflow(app, ctx));
    } catch (err) {
      errors.push({ index: i, app, error: err.message });
      if (ctx.stopOnError !== false) {
        const name = app.appName || app.detailUrl || `app ${i + 1}`;
        throw new Error(`Stopped at ${name}: ${err.message}`);
      }
    }
  }

  return { results, errors };
}
