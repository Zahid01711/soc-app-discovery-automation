/**
 * Strict validation — workflow stops if required fields missing (prevents bad notebook paste).
 */

export function validateUmbrellaApp(app) {
  const errors = [];
  const warnings = [];

  if (!app?.appName?.trim()) errors.push("App name missing from Umbrella page");
  if (!app?.appUrl?.trim() || !/^https?:\/\//i.test(app.appUrl)) {
    errors.push("Valid App URL missing (must start with http/https)");
  }
  if (!app?.umbrellaRisk?.trim()) warnings.push("Umbrella risk score not detected");
  if (!app?.identities && app?.identities !== 0) warnings.push("Identities count not detected");

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export function validateWorkflowResult(result) {
  const errors = [];
  if (!result?.app?.appName) errors.push("Result missing app name");
  if (!result?.text?.includes("APP DISCOVERY")) errors.push("Notebook block not rendered");
  if (result?.app?.xdrStatus === "pending") errors.push("XDR investigation did not complete");
  return { valid: errors.length === 0, errors };
}

export function parseUmbrellaUrls(text) {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const urls = [];
  const invalid = [];

  for (const line of lines) {
    if (!/umbrella\.com/i.test(line) || !/appdiscovery/i.test(line)) {
      invalid.push(line);
      continue;
    }
    try {
      new URL(line);
      urls.push({ detailUrl: line });
    } catch {
      invalid.push(line);
    }
  }

  return { urls, invalid };
}
