# App Discovery Automation — Architecture

## Recommendation (best fit for your environment)

**Use a Chrome Extension (Manifest V3) with rule-based extraction + optional LLM only for the narrative section.**

| Approach | Speed | Uses existing login | Safe on school network | Extends to AMP/XDR later |
|----------|-------|---------------------|------------------------|--------------------------|
| Selenium / Playwright | Medium | No (new browser) | Risky | Yes |
| Full LLM agent (browser control) | Slow | Maybe | Risky | Partial |
| **Chrome Extension (recommended)** | **Fast** | **Yes** | **Yes (human approve)** | **Yes** |
| RPA (UiPath etc.) | Medium | Yes | Heavy IT approval | Partial |

### Why not full LLM automation?

- Copy/paste and field extraction are **deterministic** — DOM scraping is faster and more reliable than an LLM reading the page.
- 15–50 apps/day needs **seconds per app**, not minutes.
- LLM browser agents can mis-click, paste into wrong fields, or trigger unintended actions on production security consoles.
- Your school network needs **auditability** — rule-based steps with a preview/approve step are easier to defend.

### Where LLM *does* help

Use Gemini (or similar) **only** for the free-text section you currently hand off to Google AI:

- "Is this app safe for a university/school network?"
- Data handling / compliance summary
- Recommended label (Approve / Not Approve / Under Audit)

Everything else (Umbrella fields, DNS counts, Talos lookup links, VirusTotal link, XDR investigate link) should be **automated without LLM**.

### What we skip in v1 (manual, as you suggested)

- Cisco XDR graph parsing
- Automatic SHA256 blocking in Umbrella

The extension will **pre-fill XDR investigate links** and a checkbox area for you to record "Clean / Malicious SHA found" after you review manually.

---

## System design

```
┌─────────────────────────────────────────────────────────────┐
│  Side Panel UI (control center)                              │
│  • Queue apps (from list or current detail page)             │
│  • Run batch (5 / 10 / 15 / custom)                          │
│  • Preview filled template before paste                      │
│  • APPROVE & PASTE (safety gate)                             │
│  • Settings: notebook URL, Gemini key, VT API key (optional) │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│  Background Service Worker                                   │
│  • Orchestrates tabs                                         │
│  • Calls optional APIs (VT, Gemini)                          │
│  • Never pastes without explicit user approval               │
└──────────────┬───────────────────────────────┬──────────────┘
               │                               │
    ┌──────────▼──────────┐         ┌──────────▼──────────┐
    │ Umbrella content    │         │ Notebook content    │
    │ script              │         │ script              │
    │ • List: queue apps  │         │ • Find template     │
    │ • Detail: extract   │         │ • Fill fields       │
    │   all fields        │         │ • Append duplicate  │
    └─────────────────────┘         └─────────────────────┘
```

---

## Daily workflow (automated path)

1. Open Umbrella → App Discovery → filter **Unreviewed** (+ risk if desired).
2. Open extension side panel → **Capture list** or open each app detail page.
3. Extension extracts: name, URL, description, risk, label, identities, DNS, category, vendor, dates.
4. Extension opens/checks (in background tabs or API):
   - VirusTotal URL report link (+ API if key configured)
   - Talos reputation lookup link
   - XDR Investigate deep link (manual review)
5. Optional: Gemini fills **School Network Assessment** section from master prompt.
6. User reviews preview → clicks **Approve & Paste**.
7. Extension appends next blank template block in notebook.
8. Repeat until daily quota (15+) is met.

---

## Safety controls (required for school SOC)

1. **No auto-submit** — nothing is pasted or blocked without explicit click.
2. **Dry-run mode** — preview only, no notebook writes.
3. **Pause / Stop** — kill batch mid-run.
4. **Action log** — local log of what was extracted and pasted (no credentials).
5. **Domain allowlist** — extension only runs on Umbrella, notebook, VT, Talos, XDR URLs you configure.
6. **No credential storage** — uses your existing Chrome session cookies only.

---

## Future extensions (same extension, new modules)

| Module | Content script target | Automation level |
|--------|----------------------|------------------|
| App Discovery | `dashboard.umbrella.com` | v1 (this project) |
| AMP | Cisco Secure Endpoint console | v2 — extract file/hash context |
| XDR cases | `xdr.security.cisco.com` | v2 — assist, not auto-block |
| Endpoint tickets | Internal notebook sections | v2 — shared template engine |

The **template engine + side panel + approve gate** are reusable across all SOC copy/paste tasks.

---

## Performance target

| Step | Manual (~) | Extension target |
|------|------------|------------------|
| Per app data copy | 3–8 min | 10–30 sec (+ your XDR review) |
| 15 apps/day | 45–120 min | ~15–30 min total |

Parallel background tab lookups (VT/Talos) while you review XDR on the current app.
