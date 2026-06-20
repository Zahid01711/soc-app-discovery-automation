# SOC App Discovery Automation

Chrome extension for **UNC Pembroke SOC** analysts — automates **Cisco Umbrella App Discovery** (Umbrella → VirusTotal → Talos → XDR → SOC-Interns notebook) in your logged-in browser.

[![Version](https://img.shields.io/badge/version-0.5.0-blue)](extension/manifest.json)
[![Chrome](https://img.shields.io/badge/Chrome-MV3-green)](https://developer.chrome.com/docs/extensions/mv3/)

## Quick links

| Doc | Purpose |
|-----|---------|
| **[mastermind.md](mastermind.md)** | Full project memory — workflow, files, XDR modes, AI agent rules |
| **[INSTALL.md](INSTALL.md)** | Load extension in Chrome |
| [docs/WORKFLOW.md](docs/WORKFLOW.md) | Analyst step-by-step process |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | Design & safety |

## GitHub

**Repository:** [github.com/Zahid01711/soc-app-discovery-automation](https://github.com/Zahid01711/soc-app-discovery-automation)

## Install (30 seconds)

1. Clone or download this repo
2. Chrome → `chrome://extensions` → **Developer mode** ON
3. **Load unpacked** → select the **`extension`** folder
4. Open side panel → complete setup checklist

```
git clone git@github.com:Zahid01711/soc-app-discovery-automation.git
```

## What it does

- **Batch:** Paste 5–15 Umbrella app URLs → auto-fill notebook templates
- **Single app:** Run from current Umbrella detail page
- **XDR modes:** Automatic · Assist (watch tab) · Manual (you pick Clean/Uncommon/Malicious)
- **Safety:** Dry-run ON by default · Stop on error · Domain never auto-blocked

## Project structure

```
├── mastermind.md     ← Start here (AI agents & full reference)
├── extension/        ← Chrome extension (load this)
├── docs/
├── INSTALL.md
└── videos rec/       ← Local training videos (not on GitHub)
```

## Author

**MD Zahidul Islam** — UNC Pembroke SOC · [GitHub @Zahid01711](https://github.com/Zahid01711)

## License

Internal university SOC tooling — use and modify for authorized SOC operations only.
