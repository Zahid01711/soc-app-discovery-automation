/**
 * Notebook block — Zoho-style template used for every app (fields change, format stays same).
 */

export const BLOCK_START = "----- APP DISCOVERY -----";

export function renderEntry(d) {
  const analystName = d.analystName || "MD Zahidul Islam";
  const vtBadge = pickBadge(d.virusTotalSummary, "vt");
  const talosBadge = pickBadge(d.talosSummary, "talos");
  const xdrBadge = pickBadge(d.xdrSummary, "xdr", d.xdrStatus);

  let xdrLine;
  if (d.xdrStatus === "malicious_sha") {
    const hashLines = (d.maliciousShas || []).map((h) => `  ${h}`).join("\n");
    if (d.shaBlocked?.length) {
      xdrLine = `XDR: Malicious SHA found — BLOCKED in XDR:\n${d.shaBlocked.map((h) => `  ${h}`).join("\n")}`;
      if (d.shaBlockFailed?.length) {
        xdrLine += `\nFailed to block:\n${d.shaBlockFailed.map((h) => `  ${h}`).join("\n")}`;
      }
    } else {
      xdrLine = `XDR: Malicious SHA found — block SHA256 (domain NOT blocked unless malicious):\n${hashLines}`;
    }
  } else if (d.xdrStatus === "uncommon") {
    xdrLine = "XDR: Uncommon — reviewed, overall clean";
  } else {
    xdrLine = "XDR: Clean";
  }

  return [
    "╔══════════════════════════════════════════════════════════════════════╗",
    "║ APP DISCOVERY REPORT                                                 ║",
    "╚══════════════════════════════════════════════════════════════════════╝",
    `Date: ${d.date || ""}`,
    `Analyst: ${analystName}`,
    "",
    "------------------------ APP PROFILE -----------------------------------",
    `App Name         : ${d.appName || ""}`,
    `App URL          : ${d.appUrl || ""}`,
    `Vendor: ${d.vendor || ""}`,
    `Category: ${d.category || ""}`,
    `App Type: ${d.appType || ""}`,
    `Description      : ${d.description || ""}`,
    "",
    "------------------------ UMBRELLA --------------------------------------",
    `Umbrella Risk    : ${d.umbrellaRisk || ""}`,
    `Label            : ${d.currentLabel || ""}`,
    `Identities       : ${d.identities || ""}`,
    `DNS Total        : ${d.dnsTotal || ""}`,
    `DNS Blocked      : ${d.dnsBlocked || ""}`,
    `First Detected   : ${d.firstDetected || ""}`,
    `Last Detected    : ${d.lastDetected || ""}`,
    `Business Risk    : ${d.businessRisk || ""}`,
    `Usage Risk       : ${d.usageRisk || ""}`,
    `Vendor Compliance: ${d.vendorCompliance || ""}`,
    `Web Reputation (Talos/Umbrella): ${d.webReputation || ""}`,
    "",
    "------------------------ THREAT INTEL ----------------------------------",
    `VirusTotal       : ${vtBadge} ${d.virusTotalSummary || ""}`,
    `Talos Reputation : ${talosBadge} ${d.talosSummary || ""}`,
    `XDR              : ${xdrBadge} ${xdrLine}`,
    ...(d.geminiAssessment ? ["", "Google AI Assessment:", d.geminiAssessment] : []),
    "",
    "------------------------ DECISION --------------------------------------",
    `Recommended Label: ${d.recommendedLabel || "Under Audit"}`,
    `Analyst Notes    : ${d.analystNotes || ""}`,
    "",
    "-------------------------",
    "",
  ].join("\n");
}

export function renderBlankBlock() {
  return [
    BLOCK_START,
    "Date:",
    "",
    "App Name:",
    "App URL:",
    "Vendor:",
    "Category:",
    "App Type:",
    "Description:",
    "",
    "Umbrella Risk:",
    "Label:",
    "Identities:",
    "DNS Total:",
    "DNS Blocked:",
    "First Detected:",
    "Last Detected:",
    "Business Risk:",
    "Usage Risk:",
    "Vendor Compliance:",
    "Web Reputation (Talos/Umbrella):",
    "",
    "VirusTotal:",
    "Talos Reputation:",
    "XDR:",
    "",
    "Recommended Label:",
    "Analyst Notes:",
    "",
    "-------------------------",
    "",
  ].join("\n");
}

export function renderBatch(entries, appendBlank = true) {
  const body = entries.map((e) => renderEntry(e.app || e)).join("\n");
  return appendBlank ? body + renderBlankBlock() : body;
}

export function inferRecommendedLabel(d) {
  if (d.xdrStatus === "malicious_sha") {
    return d.shaBlocked?.length ? "Under Audit — SHA blocked" : "Review — block SHA256 in XDR";
  }
  if (/not found/i.test(d.vendorCompliance || "")) return "Under Audit";
  if (/not approved/i.test(d.currentLabel || "")) return "Not Approved";
  if (/under audit/i.test(d.currentLabel || "")) return "Under Audit";
  if (/approved/i.test(d.currentLabel || "")) return "Approved";
  if (/medium|high/i.test(d.umbrellaRisk || "")) return "Under Audit";
  return "Approved";
}

function pickBadge(text, source, xdrStatus) {
  const t = (text || "").toLowerCase();
  if (source === "xdr") {
    if (xdrStatus === "malicious_sha" || t.includes("malicious")) return "🔴";
    if (xdrStatus === "uncommon" || t.includes("uncommon")) return "🟡";
    return "🟢";
  }
  if (t.includes("malicious") || t.includes("flagged") || t.includes("poor")) return "🔴";
  if (t.includes("uncommon") || t.includes("neutral") || t.includes("unknown")) return "🟡";
  return "🟢";
}
