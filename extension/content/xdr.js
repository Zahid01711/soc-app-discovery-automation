(function () {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function emit(step, detail) {
    chrome.runtime.sendMessage({ type: "XDR_PROGRESS", step, detail }).catch(() => {});
  }

  function pageText() {
    return document.body?.innerText ?? "";
  }

  function collectShas(text) {
    const found = [];
    for (const m of text.matchAll(/\b([a-f0-9]{64})\b/gi)) found.push(m[1].toLowerCase());
    return [...new Set(found)];
  }

  function isInvestigationComplete(text) {
    return /Investigation complete/i.test(text);
  }

  function isStillLoading(text) {
    return /Investigating|Loading|Querying|In progress|Please wait/i.test(text) && !isInvestigationComplete(text);
  }

  function extractResults() {
    const text = pageText();
    const shas = collectMaliciousShas(text);
    const investigationComplete = isInvestigationComplete(text);
    const domainCheck = inspectDomainStatus(text);

    if (shas.length > 0) {
      return {
        investigationComplete,
        xdrStatus: "malicious_sha",
        maliciousShas: shas,
        domainStatus: domainCheck.status,
        summary: `Malicious SHA256 tied to domain — ${shas.length} hash(es). Domain: ${domainCheck.status}`,
        validation: domainCheck,
      };
    }

    if (investigationComplete) {
      if (domainCheck.status === "uncommon") {
        return {
          investigationComplete,
          xdrStatus: "uncommon",
          maliciousShas: [],
          domainStatus: "uncommon",
          summary: "Uncommon — reviewed, overall clean",
          validation: domainCheck,
        };
      }
      return {
        investigationComplete,
        xdrStatus: "clean",
        maliciousShas: [],
        domainStatus: domainCheck.status || "clean",
        summary: "Clean — no malicious SHA tied to URL",
        validation: domainCheck,
      };
    }

    if (/no results|0 observables|nothing found/i.test(text)) {
      return {
        investigationComplete: true,
        xdrStatus: "clean",
        maliciousShas: [],
        domainStatus: "clean",
        summary: "Clean — no observables",
        validation: domainCheck,
      };
    }

    return {
      investigationComplete: false,
      xdrStatus: "pending",
      maliciousShas: [],
      domainStatus: "pending",
      summary: isStillLoading(text) ? "XDR scan in progress…" : "Waiting for investigation…",
      validation: domainCheck,
    };
  }

  /** SHAs near Malicious labels — ignore random page hashes */
  function collectMaliciousShas(text) {
    if (!/Malicious Process|Malicious SHA|Malicious/i.test(text)) {
      return collectShas(text).filter(() => false);
    }

    const shas = collectShas(text);
    if (!shas.length) return [];

    const maliciousBlocks = text.split(/Malicious Process|Malicious SHA/i);
    const fromMalicious = [];
    for (const block of maliciousBlocks.slice(1)) {
      fromMalicious.push(...collectShas(block.slice(0, 800)));
    }

    return fromMalicious.length ? [...new Set(fromMalicious)] : shas.slice(0, 5);
  }

  function inspectDomainStatus(text) {
    const notes = [];
    let status = "clean";

    if (/Malicious Process/i.test(text) && collectMaliciousShas(text).length) {
      status = "malicious_sha_linked";
      notes.push("Malicious SHA linked to investigation graph");
    } else if (/\bMalicious\b/i.test(text) && /domain|url|www\./i.test(text)) {
      status = "review_domain";
      notes.push("Malicious label near domain — review manually");
    } else if (/Uncommon/i.test(text)) {
      status = "uncommon";
      notes.push("Domain/URL uncommon but no malicious SHA");
    } else if (/Clean/i.test(text)) {
      status = "clean";
      notes.push("Domain appears clean in XDR");
    } else if (isInvestigationComplete(text)) {
      status = "clean";
      notes.push("Investigation complete, no malicious SHA");
    }

    return { status, notes };
  }

  function fillAndInvestigate(searchUrl) {
    const textarea =
      document.querySelector("textarea") ||
      document.querySelector("[role='textbox']") ||
      document.querySelector("[contenteditable='true']");

    if (!textarea) return { ok: false, error: "Investigate box not found." };

    textarea.focus();
    if (textarea.tagName === "TEXTAREA" || textarea.tagName === "INPUT") {
      textarea.value = searchUrl;
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    } else {
      textarea.textContent = searchUrl;
      textarea.dispatchEvent(new InputEvent("input", { bubbles: true }));
    }

    const btn = [...document.querySelectorAll("button")].find((b) => /^Investigate$/i.test(b.textContent?.trim() ?? ""));
    if (!btn) return { ok: false, error: "Investigate button not found." };
    btn.click();
    return { ok: true, searchUrl };
  }

  async function clickDomainNode(domain) {
    if (!domain) return { clicked: false };

    const host = domain.replace(/^www\./, "");
    const candidates = [];

    for (const el of document.querySelectorAll("button, a, [role='button'], span, div, p, text")) {
      const t = (el.textContent || "").trim();
      if (!t || t.length > 120) continue;
      if (t.includes(domain) || t.includes(host) || (t.startsWith("www.") && t.includes(host.split(".")[0]))) {
        candidates.push(el);
      }
    }

    const node = candidates.find((el) => el.offsetParent !== null) || candidates[0];
    if (node) {
      node.click();
      await sleep(800);
      emit("domain", `Clicked domain node: ${domain}`);
      return { clicked: true, domain };
    }
    return { clicked: false, domain };
  }

  function findShaElement(sha) {
    const head = sha.slice(0, 8);
    const tail = sha.slice(-4);
    for (const el of document.querySelectorAll("button, a, [role='button'], span, div, p")) {
      const t = (el.textContent || "").replace(/\s/g, "");
      if (t.includes(sha) || (t.includes(head) && t.includes(tail) && t.length < 100)) return el;
    }
    return null;
  }

  function validateMaliciousPanel(sha) {
    const text = pageText();
    const hasMalicious = /Malicious Process|Malicious SHA|Malicious/i.test(text);
    const hasSha = text.toLowerCase().includes(sha.slice(0, 8)) || text.toLowerCase().includes(sha.slice(-8));
    return { valid: hasMalicious && hasSha, hasMalicious, hasSha };
  }

  function findBlockButton() {
    const labels = [/^Block$/i, /^Block file$/i, /^Block indicator$/i, /^Block observable$/i, /^Add to block/i];
    for (const b of document.querySelectorAll("button, [role='menuitem']")) {
      const t = b.textContent?.trim() ?? "";
      if (labels.some((re) => re.test(t)) && b.offsetParent !== null) return b;
    }
    return null;
  }

  function openActionsMenu() {
    const btn = [...document.querySelectorAll("button")].find((b) => /Actions|Respond|Take action/i.test(b.textContent || ""));
    if (btn) btn.click();
  }

  function confirmDialog() {
    const btn = [...document.querySelectorAll("button")].find((b) => /^(Confirm|Block|Yes|OK|Submit)$/i.test(b.textContent?.trim() ?? ""));
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  }

  async function blockSha256Hashes(shas, validateFirst = true) {
    const blocked = [];
    const failed = [];
    const validated = [];

    for (const sha of shas) {
      const node = findShaElement(sha);
      if (!node) {
        failed.push({ sha, reason: "SHA node not found in graph" });
        continue;
      }

      node.click();
      await sleep(900);

      if (validateFirst) {
        const v = validateMaliciousPanel(sha);
        validated.push({ sha, ...v });
        if (!v.valid) {
          failed.push({ sha, reason: "Validation failed — panel does not confirm Malicious SHA" });
          continue;
        }
      }

      let blockBtn = findBlockButton();
      if (!blockBtn) {
        openActionsMenu();
        await sleep(600);
        blockBtn = findBlockButton();
      }

      if (!blockBtn) {
        failed.push({ sha, reason: "Block button not found" });
        continue;
      }

      blockBtn.click();
      await sleep(500);
      confirmDialog();
      await sleep(800);
      blocked.push(sha);
      emit("block", `Blocked SHA ${sha.slice(0, 12)}…`);
    }

    return { ok: true, blocked, failed, validated };
  }

  async function waitForScanComplete(maxWaitMs) {
    const start = Date.now();
    emit("wait", "XDR scan started — waiting for Investigation complete…");

    while (Date.now() - start < maxWaitMs) {
      const text = pageText();
      const elapsed = Math.round((Date.now() - start) / 1000);

      if (isInvestigationComplete(text)) {
        emit("wait", `Scan complete (${elapsed}s)`);
        return extractResults();
      }

      if (isStillLoading(text)) {
        emit("wait", `Scan in progress… ${elapsed}s`);
      } else if (/observables/i.test(text)) {
        emit("wait", `Results loading… ${elapsed}s`);
      }

      await sleep(2000);
    }

    const last = extractResults();
    if (last.investigationComplete) return last;
    throw new Error(`XDR scan timed out after ${Math.round(maxWaitMs / 1000)}s — use Manual mode or extend wait time`);
  }

  /**
   * Full auto pipeline: investigate → wait → click domain → analyze → optional block
   */
  async function runPipeline(options) {
    const { searchUrl, domain, enableShaBlocking = false, maxWaitMs = 120000 } = options;

    emit("start", `Investigating ${searchUrl}`);
    const inv = fillAndInvestigate(searchUrl);
    if (!inv.ok) return inv;

    await sleep(1500);
    let result = await waitForScanComplete(maxWaitMs);

    emit("analyze", "Checking domain node in graph…");
    await clickDomainNode(domain);
    await sleep(1000);
    result = extractResults();

    const blockReport = { blocked: [], failed: [], validated: [] };

    if (result.xdrStatus === "malicious_sha" && result.maliciousShas?.length) {
      emit("analyze", `Found ${result.maliciousShas.length} malicious SHA — reviewing each node…`);

      for (const sha of result.maliciousShas) {
        const node = findShaElement(sha);
        if (node) {
          node.click();
          await sleep(700);
        }
      }

      if (enableShaBlocking) {
        emit("block", "Auto-blocking validated malicious SHA…");
        const br = await blockSha256Hashes(result.maliciousShas, true);
        blockReport.blocked = br.blocked;
        blockReport.failed = br.failed;
        blockReport.validated = br.validated;
        result.shaBlocked = br.blocked;
        result.shaBlockFailed = br.failed;
      }
    }

    return {
      ok: true,
      ...result,
      blockReport,
      pipeline: "auto",
    };
  }

  chrome.runtime.onMessage.addListener((msg, _s, sendResponse) => {
    if (msg.type === "XDR_INVESTIGATE") {
      sendResponse(fillAndInvestigate(msg.searchUrl));
      return true;
    }
    if (msg.type === "XDR_EXTRACT") {
      sendResponse({ ok: true, ...extractResults() });
      return true;
    }
    if (msg.type === "XDR_BLOCK_SHAS") {
      blockSha256Hashes(msg.shas || [], msg.validateFirst !== false).then(sendResponse);
      return true;
    }
    if (msg.type === "XDR_RUN_PIPELINE") {
      runPipeline(msg).then(sendResponse).catch((e) => sendResponse({ ok: false, error: e.message }));
      return true;
    }
    if (msg.type === "XDR_CLICK_DOMAIN") {
      clickDomainNode(msg.domain).then(sendResponse);
      return true;
    }
    return true;
  });
})();
