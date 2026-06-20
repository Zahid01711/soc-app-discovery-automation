export function getDomain(url) {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname;
  } catch {
    return String(url || "")
      .replace(/^https?:\/\//, "")
      .split("/")[0];
  }
}

export function buildToolUrls(appUrl) {
  const domain = getDomain(appUrl);
  return {
    virusTotalUrl: `https://www.virustotal.com/gui/domain/${domain}`,
    talosUrl: `https://talosintelligence.com/reputation_center/lookup?search=${encodeURIComponent(domain)}`,
    xdrInvestigateUrl: "https://xdr.us.security.cisco.com/investigate",
    geminiUrl: "https://gemini.google.com/app",
    domain,
  };
}
