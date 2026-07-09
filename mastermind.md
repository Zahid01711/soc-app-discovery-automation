# Mastermind — UNC Pembroke SOC App Discovery Automation

> **[IMPORTANT RULES FOR AI AGENTS]**
> 1. **Read this file first** before making any modifications or running commands. It holds the active memory, architecture, workflow, and current state of the codebase.
> 2. **Update this file** immediately after completing any modifications, updating the **Development History** and **Current Status** sections.
> 3. **Expose no API keys or secrets** in code. This project uses **logged-in browser sessions only** — no Umbrella/XDR/Gemini API keys in the extension.
> 4. **Commit to Git** under the user's credentials for every major change:
>    - **Name:** MD Zahidul Islam
>    - **Email:** ulislamjahid9@gmail.com

---

## 📋 Project Overview

**SOC App Discovery Assistant** is a Chrome Extension (Manifest V3) built for **UNC Pembroke SOC analysts** to automate the daily **Cisco Umbrella App Discovery** workflow.

Analysts must review **15+ cloud apps per day**. Manually copying data between Umbrella, VirusTotal, Talos, Cisco XDR, and the **SOC-Interns Google Sheet** is slow and error-prone. This extension runs the same tab-to-tab process in the **already logged-in Chrome session** — no Selenium, no re-login, no external APIs.

### What it automates (per app)

| Step | Tool | Action |
|------|------|--------|
| 1 | **Cisco Umbrella** | App Discovery detail — name, URL, DNS, risk, label, vendor, dates |
| 2 | **VirusTotal** | Domain reputation summary |
| 3 | **Cisco Talos** | Reputation score / category |
| 4 | **Cisco XDR Investigate** | Paste app URL, wait for scan, detect clean / uncommon / malicious SHA |
| 5 | **SOC-Interns Sheet** | Paste filled notebook block (+ blank template for next app) |

### XDR policy (from analyst workflow / screen recordings)

- **Clean** → notebook: `XDR: Clean`
- **Uncommon but OK** → `XDR: Uncommon — reviewed, overall clean`
- **Malicious SHA tied to domain** → list SHA256; **block SHA only** — **never auto-block domain** unless domain itself is malicious
- Domain blocking requires human judgment per university policy

---

## 🛠️ Tech Stack & Key Files

| Layer | Technology |
|-------|------------|
| Extension | Chrome Manifest V3, ES modules |
| UI | Side panel (`extension/sidepanel/`) |
| Orchestration | Service worker (`extension/background/service-worker.js`) |
| Workflow engine | `extension/lib/workflow-engine.js` |
| Tab messaging | `extension/lib/tab-messaging.js` (retries, background tabs) |
| Validation | `extension/lib/validate.js` |
| Notebook template | `extension/lib/template.js` |
| Content scripts | `umbrella.js`, `virustotal.js`, `talos.js`, `xdr.js`, `notebook.js` |

### Repository layout

```
app-discovery-automation/
├── mastermind.md          ← THIS FILE (project memory for AI + humans)
├── README.md              ← Public quick start
├── INSTALL.md             ← Chrome load instructions
├── docs/
│   ├── ARCHITECTURE.md
│   ├── WORKFLOW.md
│   └── MASTER_PROMPT.md   ← Legacy Gemini prompt (optional manual use)
├── extension/             ← LOAD THIS FOLDER in chrome://extensions
│   ├── manifest.json
│   ├── background/
│   ├── content/
│   ├── lib/
│   ├── sidepanel/
│   └── icons/
└── videos rec/            ← Local screen recordings (gitignored — too large)
```

---

## 🚀 Install & Run (Chrome Extension)

### One-time install

1. Open **`chrome://extensions`**
2. Enable **Developer mode**
3. **Load unpacked** → select:
   ```
   F:\UNCP_Reaserch\soc analyst automation\app discovery automation\extension
   ```
4. Pin extension → open **side panel**

### Daily workflow

1. Log into Chrome: **Umbrella**, **XDR**, **SOC-Interns** Google Sheet
2. Side panel → **Save notebook tab** (click target cell first)
3. Keep **Dry-run ON** until preview looks correct
4. **Batch:** paste Umbrella app detail URLs (one per line) → **Run all apps**
5. Review preview → dry-run OFF → **Paste to notebook**

### Three run modes

| Mode | How |
|------|-----|
| **Batch URLs** | Paste 5–15 Umbrella App Discovery detail URLs |
| **Single app** | Open one Umbrella detail tab → Run this app |
| **List capture** | App Discovery list page → Capture list → Run list |

---

## ⚡ XDR Investigation Modes (v0.5+)

| Mode | Behavior |
|------|----------|
| **Automatic** | Pastes URL, waits up to 120s for scan, clicks domain node, detects malicious SHA, optional auto-block with validation |
| **Assist** | Switches to XDR tab so analyst can watch; bot still completes automatically |
| **Manual** | Bot pastes URL and opens XDR; analyst clicks **Clean / Uncommon / Malicious** in side panel when ready |

**Safety defaults:** Dry-run ON · Stop on error ON · Auto-block SHA OFF · Domain never auto-blocked

---

## 📝 Notebook Template Fields

Each app produces one block (same format as Zoho CRM example in training videos):

- Date (today, e.g. `Fri, Jun 19, 2026`)
- App Name, URL, Vendor, Category, Type, Description
- Umbrella Risk, Label, Identities, DNS Total/Blocked, First/Last Detected
- Business Risk, Usage Risk, Vendor Compliance, Web Reputation
- VirusTotal summary, Talos summary
- XDR result (Clean / Uncommon / Malicious SHA list)
- Recommended Label, Analyst Notes

---

## 🔐 Security & Compliance Notes

- Runs only on allowlisted domains (Umbrella, VT, Talos, XDR, Google Sheets)
- **Dry-run** prevents notebook writes until analyst approves
- **No credentials stored** — uses existing Chrome session cookies
- **No Gemini/API** in production path — optional manual Gemini tab only
- Screen recordings in `videos rec/` are **local only** (gitignored)

---

## 📌 Development History

* **Jun 19, 2026**: Project started from SOC analyst screen recordings (3 videos). Identified workflow: Umbrella → VT → Talos → XDR → SOC-Interns notebook.
* **Jun 19, 2026**: v0.1 — Chrome extension scaffold: Umbrella extractor, side panel, template engine.
* **Jun 19, 2026**: v0.2 — Removed API approach; pure tab-to-tab automation matching manual process.
* **Jun 19, 2026**: v0.3 — Batch URL queue, strict validation, combined notebook paste, optional XDR SHA block.
* **Jun 19, 2026**: v0.4 — UI overhaul (setup checklist, do/don't), tab messaging retries, `INSTALL.md`.
* **Jun 19, 2026**: v0.5 — Full XDR pipeline: long scan wait, domain node click, malicious SHA validation, Auto/Assist/Manual modes, manual decision panel in side panel.
* **Jun 19, 2026**: Created `mastermind.md`, `.gitignore`, pushed to GitHub `Zahid01711/soc-app-discovery-automation`.
* **Jun 23, 2026**: v0.6 — Added improved notebook block styling with box/line format and color status markers (🟢/🟡/🔴), analyst name field, optional Google auto-assessment via Gemini tab, and `keepUmbrellaTabsOpen` to keep app tabs open for manual label change to **Under Audit**.
* **Jul 9, 2026**: v0.7 — Stability pass: `scripting.executeScript` fallback for content scripts, duplicate-injection guards, manual XDR stop handling, notebook blank-template append fix, Gemini failures non-blocking, side panel error surfacing, XDR tab kept open in Assist/Manual modes.

---

## 🔮 Current Status

* **Status:** **v0.7.0 — Stability and messaging fixes; ready for office dry-run testing**
* **Version:** `0.7.0` (see `extension/manifest.json`)
* **GitHub Repository:** `https://github.com/Zahid01711/soc-app-discovery-automation`
* **Active Branch:** `v2`
* **Git Auth:** SSH (`git@github.com:Zahid01711/soc-app-discovery-automation.git`) via `~/.ssh/github_zahid`
* **Next Steps:**
  1. Reload extension in `chrome://extensions` and test one app with **dry-run ON**
  2. Test Automatic XDR mode on a clean app; then Assist and Manual modes
  3. Paste to SOC-Interns with dry-run OFF — confirm blank template appends
  4. Share one real notebook entry sample if exact format match still needed
  5. Future: AMP module, endpoint tickets (reuse workflow engine + side panel)

---

## 🤖 Master AI Agent System Prompt

*Copy and paste when sharing this project with any AI assistant:*

```text
You are a coding assistant working on the UNC Pembroke SOC App Discovery Chrome Extension.
Read mastermind.md in the repo root FIRST — it contains architecture, workflow, XDR modes, and current status.

Strict rules:
1. READ mastermind.md before any code changes.
2. UPDATE mastermind.md Development History and Current Status after major edits.
3. NEVER add API keys, PATs, or credentials to committed files. Browser session auth only.
4. NEVER auto-block domains in XDR — only SHA256 when explicitly enabled and validated.
5. Keep dry-run as default safety behavior.
6. Match the analyst's manual workflow: Umbrella → VirusTotal → Talos → XDR → SOC-Interns Google Sheet.
7. Commit under: MD Zahidul Islam <ulislamjahid9@gmail.com>
8. Extension load path: extension/ folder (not repo root).
9. Large video files in videos rec/ are gitignored — do not commit them.

Tech: Chrome MV3, content scripts, service worker, side panel, ES modules.
Key files: workflow-engine.js, xdr.js, umbrella.js, notebook.js, sidepanel.js.
```

---

## 🔗 Related Documentation

- [README.md](README.md) — Quick start
- [INSTALL.md](INSTALL.md) — Load extension in Chrome
- [docs/WORKFLOW.md](docs/WORKFLOW.md) — Step-by-step analyst process
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — Design decisions
