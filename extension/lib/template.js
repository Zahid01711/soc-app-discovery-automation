/**
 * Notebook block — matches SOC-Interns OneNote table layout (plain text for Google Sheets).
 */

export const BLOCK_START = "----- APP DISCOVERY -----";
const BLOCK_END = "-------------------------";

export function renderEntry(d, entryNum = 1) {
  const analystName = d.analystName || "MD Zahidul Islam";
  const status = d.recommendedLabel || inferRecommendedLabel(d);
  const vtLine = formatVtLine(d.virusTotalSummary);
  const talosLine = formatTalosLine(d.talosSummary);
  const xdrLine = formatXdrLine(d);
  const investigation = buildInvestigation(d);

  return [
    BLOCK_START,
    `Date: ${shortDate(d.date)} | Entry: #${entryNum} | Status: ${status}`,
    "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    `Name             : ${d.appName || ""}`,
    `URL              : ${d.appUrl || ""}`,
    `Description      : ${d.description || ""}`,
    `Vendor           : ${d.vendor || ""}`,
    `Risk Score       : ${d.umbrellaRisk || ""}`,
    `Identities       : ${d.identities || ""}`,
    `DNS Requests     : Total: ${formatNum(d.dnsTotal)}, Blocked: ${d.dnsBlocked || "-"}`,
    `Category         : ${d.category || ""}`,
    `App Type         : ${d.appType || ""}`,
    "",
    "Tool(s) used:",
    `  Virus-Total    : ${vtLine}`,
    `  Talos          : ${talosLine}`,
    `  XDR            : ${xdrLine}`,
    "",
    "Investigation:",
    investigation,
    "",
    `Analyst          : ${analystName}`,
    `Analyst Notes    : ${d.analystNotes || ""}`,
    "",
    BLOCK_END,
    "",
  ].join("\n");
}

export function renderBlankBlock() {
  return [
    BLOCK_START,
    "Date:",
    "Entry: #",
    "Status:",
    "",
    "Name:",
    "URL:",
    "Description:",
    "Vendor:",
    "Risk Score:",
    "Identities:",
    "DNS Requests:",
    "Category:",
    "App Type:",
    "",
    "Tool(s) used:",
    "  Virus-Total:",
    "  Talos:",
    "  XDR:",
    "",
    "Investigation:",
    "",
    "Analyst Notes:",
    "",
    BLOCK_END,
    "",
  ].join("\n");
}

export function renderBatch(entries, appendBlank = true) {
  const body = entries
    .map((e, i) => renderEntry(e.app || e, i + 1))
    .join("\n");
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
  return "Under Audit";
}

function shortDate(dateStr) {
  if (!dateStr) return workflowDateFallback();
  const m = dateStr.match(/(\w+),\s*(\w+)\s+(\d+),\s*(\d+)/);
  if (m) {
    const months = { Jan: "01", Feb: "02", Mar: "03", Apr: "04", May: "05", Jun: "06", Jul: "07", Aug: "08", Sep: "09", Oct: "10", Nov: "11", Dec: "12" };
    const mm = months[m[2]] || "01";
    return `${mm}/${m[3].padStart(2, "0")}/${m[4]}`;
  }
  return dateStr;
}

function workflowDateFallback() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${mm}/${dd}/${d.getFullYear()}`;
}

function formatNum(n) {
  if (!n && n !== 0) return "-";
  const num = String(n).replace(/,/g, "");
  return Number(num).toLocaleString("en-US");
}

function formatVtLine(summary) {
  const s = summary || "Checked — see VirusTotal";
  if (/0\/\d+|no security vendors flagged|no vendors flagged|clean/i.test(s)) {
    return `🟢 ${s.includes("vendors") ? s : "No security vendors flagged this URL as malicious"}`;
  }
  if (/flagged|malicious|\d+\/\d+ vendors/i.test(s)) return `🔴 ${s}`;
  return `🟡 ${s}`;
}

function formatTalosLine(summary) {
  const s = summary || "Checked — see Talos";
  if (/favorable|score\s*[1-9]/i.test(s)) return `🟢 ${s}`;
  if (/neutral/i.test(s)) return `🟡 Neutral`;
  if (/poor|questionable|-\d/i.test(s)) return `🔴 ${s}`;
  if (/uncommon/i.test(s)) return `🟡 Uncommon`;
  return `🟡 ${s}`;
}

function formatXdrLine(d) {
  if (d.xdrStatus === "malicious_sha") {
    const hashes = (d.maliciousShas || []).map((h) => `    ${h}`).join("\n");
    if (d.shaBlocked?.length) {
      const blocked = d.shaBlocked.map((h) => `    ${h}`).join("\n");
      return `🔴 Malicious SHA — BLOCKED:\n${blocked}`;
    }
    return `🔴 Malicious SHA — block SHA256 (domain NOT auto-blocked):\n${hashes}`;
  }
  if (d.xdrStatus === "uncommon") return "🟡 uncommon — reviewed, overall clean";
  const summary = (d.xdrSummary || "clean").replace(/^XDR:\s*/i, "");
  return `🟢 ${summary}`;
}

function buildInvestigation(d) {
  const lines = [];
  if (d.appType) lines.push(`  Usage Type       : ${d.appType}`);
  if (d.businessRisk) lines.push(`  Business Risk    : ${d.businessRisk}`);
  if (d.usageRisk) lines.push(`  Usage Risk       : ${d.usageRisk}`);
  if (d.vendorCompliance) lines.push(`  Vendor Compliance: ${d.vendorCompliance}`);
  if (d.firstDetected) lines.push(`  First Detected   : ${d.firstDetected}`);
  if (d.lastDetected) lines.push(`  Last Detected    : ${d.lastDetected}`);
  if (d.webReputation) lines.push(`  Web Reputation   : ${d.webReputation}`);

  if (d.geminiAssessment) {
    lines.push("");
    lines.push(`  (AI) What is ${d.appName} and what is it used for?`);
    lines.push(`  ${d.geminiAssessment.replace(/\n/g, "\n  ")}`);
  } else if (d.description) {
    lines.push("");
    lines.push(`  (AI) What is ${d.appName} and what is it used for?`);
    lines.push(`  ${d.description}`);
  }

  return lines.length ? lines.join("\n") : "  (pending)";
}
