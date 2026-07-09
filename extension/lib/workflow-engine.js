import { workflowDate } from "./date.js";
import { validateUmbrellaApp, validateWorkflowResult } from "./validate.js";
import { renderEntry, inferRecommendedLabel } from "./template.js";
import { buildToolUrls } from "./links.js";
import { sendTabMessage, sleep, withBackgroundTab, ensureTabReady } from "./tab-messaging.js";

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
  return true;
}

export function getPendingManualXdr() {
  return pendingManualXdr ? { tabId: pendingManualXdr.tabId, appName: pendingManualXdr.app?.appName } : null;
}

function waitForManualDecision(tabId, app, onProgress, shouldStop) {
  return new Promise((resolve) => {
    const finish = (result) => {
      clearInterval(poll);
      pendingManualXdr = null;
      resolve(result);
    };

    pendingManualXdr = { resolve: finish, tabId, app };
    onProgress?.(STEP.XDR_MANUAL, "Waiting for your decision in the side panel…");

    const poll = setInterval(() => {
      if (shouldStop?.()) {
        finish({ cancelled: true, xdrStatus: "clean", summary: "Stopped by user", maliciousShas: [] });
      }
    }, 400);
  });
}

async function waitForUmbrellaDetail(tabId, detailUrl, maxWaitMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const detail = await sendTabMessage(tabId, "EXTRACT_DETAIL").catch(() => null);
    if (detail?.ok && detail.app?.appUrl && detail.app?.appName) return detail;
    await sleep(2000);
  }
  return sendTabMessage(tabId, "EXTRACT_DETAIL");
}

async function readExternalCheck(tabId, messageType, label, waitMs = 3500) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await sendTabMessage(tabId, messageType).catch(() => null);
    if (res?.summary && !/see (virus|talos) tab/i.test(res.summary)) return res;
    await sleep(waitMs / 2 + attempt * 800);
  }
  throw new Error(`${label}: could not read result — log in to ${label} in Chrome and retry`);
}

async function runXdrPhase(app, ctx) {
  const {
    xdrMode = "auto",
    enableShaBlocking = false,
    xdrMaxWaitMs = 120000,
    focusXdrTab = false,
    keepXdrTabOpen = false,
    onProgress,
    focusTab,
    closeTab,
  } = ctx;

  const links = buildToolUrls(app.appUrl);
  const xdrTab = await ctx.openTab(links.xdrInvestigateUrl, false);
  await ctx.waitLoad(xdrTab.id);
  await ensureTabReady(xdrTab.id, links.xdrInvestigateUrl);
  await sleep(2500);

  app.shaBlocked = [];
  app.shaBlockFailed = [];
  app.xdrMode = xdrMode;

  const keepTab = keepXdrTabOpen || xdrMode === "assist" || xdrMode === "manual";

  if (xdrMode === "manual") {
    onProgress?.(STEP.XDR, "Pasting URL — switch to XDR and review…");
    const inv = await sendTabMessage(xdrTab.id, "XDR_INVESTIGATE", { searchUrl: app.appUrl });
    if (!inv?.ok) {
      if (!keepTab) await closeTab?.(xdrTab.id);
      throw new Error(`XDR: ${inv?.error || "could not start investigation"}`);
    }

    await focusTab?.(xdrTab.id);
    onProgress?.(STEP.XDR_MANUAL, "Review XDR scan, then pick Clean / Uncommon / Malicious below");

    const manual = await waitForManualDecision(xdrTab.id, app, onProgress, ctx.shouldStop);
    if (manual.cancelled) {
      if (!keepTab) await closeTab?.(xdrTab.id);
      throw new Error("Workflow stopped");
    }
    app.xdrStatus = manual.xdrStatus || "clean";
    app.maliciousShas = manual.maliciousShas || [];
    app.xdrSummary = manual.summary || manual.xdrStatus;
    app.shaBlocked = manual.shaBlocked || [];
    app.analystNotes = manual.analystNotes || "";

    if (!keepTab) await closeTab?.(xdrTab.id);
    return;
  }

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
    if (!keepTab) await closeTab?.(xdrTab.id);
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

  if (!keepTab) await closeTab?.(xdrTab.id);
}

export async function runAppWorkflow(app, ctx) {
  const { waitMs = 4000, onProgress, keepUmbrellaTabsOpen = true, analystName = "MD Zahidul Islam" } = ctx;

  if (ctx.shouldStop?.()) throw new Error("Workflow stopped");

  app.date = workflowDate();
  app.analystName = analystName;
  const log = { steps: [], appName: app.appName };

  const progress = (step, detail) => {
    log.steps.push({ step, detail, at: Date.now() });
    onProgress?.(step, app, detail);
  };

  if (app.detailUrl) {
    progress(STEP.UMBRELLA, "Loading app page…");
    const tab = await ctx.openTab(app.detailUrl, false);
    await ctx.waitLoad(tab.id);
    await ensureTabReady(tab.id, app.detailUrl);
    await sleep(3500);
    const detail = await waitForUmbrellaDetail(tab.id, app.detailUrl);
    if (!keepUmbrellaTabsOpen) {
      await ctx.closeTab?.(tab.id);
    } else {
      app.keepOpenTabId = tab.id;
      progress(STEP.UMBRELLA, "Left Umbrella app tab open for manual label update.");
    }
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
    return readExternalCheck(tabId, "VT_EXTRACT", "VirusTotal", waitMs);
  }, { minReadyMs: waitMs });
  app.virusTotalSummary = vt.summary;
  progress(STEP.VT, vt.summary);

  progress(STEP.TALOS, "Checking reputation…");
  const talos = await withBackgroundTab(links.talosUrl, async (tabId) => {
    await sleep(waitMs);
    return readExternalCheck(tabId, "TALOS_EXTRACT", "Talos", waitMs);
  }, { minReadyMs: waitMs });
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

  if (ctx.enableGoogleAutoAssessment) {
    try {
      app.geminiAssessment = await runGoogleAssessment(app, ctx);
      progress("Google", "Assessment captured.");
    } catch (err) {
      progress("Google", `Skipped — ${err.message}`);
    }
  }

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

async function runGoogleAssessment(app, ctx) {
  const links = buildToolUrls(app.appUrl);
  const tab = await ctx.openTab(links.geminiUrl, false);
  await ctx.waitLoad(tab.id);
  await ensureTabReady(tab.id, links.geminiUrl);
  await sleep(3000);

  const prompt = [
    "You are a SOC analyst assistant.",
    "Return a short school-network safety assessment in 4 lines:",
    "1) Summary",
    "2) Risk",
    "3) Recommendation",
    "4) Action",
    `App: ${app.appName}`,
    `URL: ${app.appUrl}`,
    `Umbrella Risk: ${app.umbrellaRisk}`,
    `VirusTotal: ${app.virusTotalSummary}`,
    `Talos: ${app.talosSummary}`,
    `XDR: ${app.xdrSummary}`,
  ].join("\n");

  const res = await sendTabMessage(tab.id, "GEMINI_RUN_PROMPT", { prompt });
  if (!ctx.keepGoogleTabOpen) {
    await ctx.closeTab?.(tab.id);
  } else {
    app.keepGoogleTabId = tab.id;
  }
  if (!res?.ok) {
    throw new Error(res?.error || "Gemini prompt failed");
  }
  return res.response || "";
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
        const partial = { results, errors, stopped: true, stoppedAt: name, message: err.message };
        throw Object.assign(new Error(`Stopped at ${name}: ${err.message}`), { partial });
      }
    }
  }

  return { results, errors };
}
