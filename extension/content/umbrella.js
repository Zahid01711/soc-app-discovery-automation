/**
 * Content script — Cisco Umbrella App Discovery pages
 */

(function () {
  if (window.__SOC_ADA_umbrella__) return;
  window.__SOC_ADA_umbrella__ = true;

  function extractDetail() {
    const text = document.body?.innerText ?? "";

    const appName =
      document.querySelector("h1")?.textContent?.trim()?.replace(/^Application:\s*/i, "") ||
      matchField(text, "Application:") ||
      "";

    const appUrl =
      [...document.querySelectorAll("a[href^='http']")].map((a) => a.href).find((h) =>
        !h.includes("umbrella.com") && !h.includes("cisco.com")
      ) ||
      matchField(text, "App URL") ||
      "";

    return {
      extractedAt: new Date().toISOString(),
      date: new Date().toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
      appName,
      appUrl,
      vendor: matchField(text, "Vendor"),
      category: matchField(text, "Category"),
      appType: matchField(text, "App Type"),
      description: getDescription(),
      umbrellaRisk: findBadge(/^(Very High|High|Medium|Low|Very Low)$/i),
      currentLabel: findBadge(/^(Unreviewed|Approved|Not Approved|Under Audit)$/i),
      identities: matchNumber(text, "Identities"),
      dnsTotal: matchDnsTotal(text),
      dnsBlocked: matchField(text, "Blocked") || "0",
      firstDetected: matchField(text, "First Detected"),
      lastDetected: matchField(text, "Last Detected"),
      businessRisk: matchField(text, "Business Risk"),
      usageRisk: matchField(text, "Usage Risk"),
      vendorCompliance: matchField(text, "Vendor Compliance"),
      webReputation: matchField(text, "Web Reputation"),
      sourceUrl: location.href,
      detailUrl: location.href,
    };
  }

  function extractList() {
    const apps = [];
    document.querySelectorAll("table tbody tr, [role='row']").forEach((row) => {
      const link = row.querySelector("a[href*='appdiscovery']");
      if (!link) return;
      apps.push({
        appName: link.textContent?.trim() || "",
        detailUrl: link.href,
        rowText: row.innerText?.slice(0, 400) || "",
      });
    });
    return apps;
  }

  function getDescription() {
    const h1 = document.querySelector("h1");
    const p = h1?.parentElement?.querySelector("p");
    return p?.textContent?.trim()?.slice(0, 500) || "";
  }

  function matchField(text, label) {
    const re = new RegExp(`${label}\\s*[:\\n]\\s*([^\\n]+)`, "i");
    return text.match(re)?.[1]?.trim() ?? "";
  }

  function matchNumber(text, label) {
    const re = new RegExp(`${label}[^\\d]*(\\d[\\d,]*)`, "i");
    return text.match(re)?.[1]?.replace(/,/g, "") ?? "";
  }

  function matchDnsTotal(text) {
    const m =
      text.match(/DNS Requests[^\d]*Total[^\d]*(\d[\d,]*)/i) ||
      text.match(/Total[^\d]*(\d[\d,]*)/i);
    return m ? m[1].replace(/,/g, "") : "";
  }

  function findBadge(re) {
    for (const el of document.querySelectorAll("button, span, div")) {
      const t = el.textContent?.trim() ?? "";
      if (re.test(t) && t.length < 30) return t;
    }
    return "";
  }

  window.__SOC_APP_DISCOVERY__ = { extractDetail, extractList };

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg.type === "EXTRACT_DETAIL") {
      if (!location.href.includes("appdiscovery")) {
        sendResponse({ ok: false, error: "Open an App Discovery detail page first." });
        return;
      }
      sendResponse({ ok: true, app: extractDetail() });
    }

    if (msg.type === "EXTRACT_LIST") {
      const apps = extractList();
      sendResponse({ ok: apps.length > 0, apps, error: apps.length ? undefined : "No apps found on this page." });
    }

    return true;
  });

  const badge = document.createElement("div");
  badge.id = "soc-app-discovery-badge";
  badge.textContent = "SOC App Discovery Assistant active";
  badge.style.cssText =
    "position:fixed;bottom:8px;right:8px;z-index:99999;background:#1a3a5c;color:#fff;padding:4px 10px;border-radius:6px;font:11px sans-serif;opacity:0.85;pointer-events:none;";
  if (location.hostname.includes("umbrella.com")) {
    document.documentElement.appendChild(badge);
    setTimeout(() => badge.remove(), 4000);
  }
})();
