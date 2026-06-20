# Workflow — From Your Videos (No APIs)

This matches the three screen recordings frame-by-frame.

## Tools open in your Chrome tabs (from video)

- **App Discovery** — Cisco Umbrella
- **SOC-Interns** — Google Sheets notebook
- **Cisco XDR — Investigate**
- **VirusTotal — URL**
- **Reputation Lookup** — Talos
- Sometimes **Gemini** in browser (manual question — not API)

## Per-app flow

### A. Umbrella App Discovery (detail page)

Copy from page (extension reads same fields):

- App name + description under title
- Risk score badge (Medium, etc.)
- Label (Unreviewed, Under Audit, …)
- App URL, Category, App Type, Vendor
- Identities count
- DNS Requests total / blocked
- First Detected / Last Detected
- Risk Details tab: Business Risk, Usage Risk, Vendor Compliance, Web Reputation

### B. VirusTotal

- Open `virustotal.com/gui/domain/{domain}`
- Record: clean (0 vendors) or flagged count

### C. Talos

- Open Talos reputation lookup for domain
- Record: score / Neutral / Uncommon

### D. Cisco XDR Investigate

- Go to `xdr.us.security.cisco.com/investigate`
- Paste full app URL (e.g. `https://www.zoho.com/crm/`)
- Click **Investigate**
- Wait for graph

**If clean:** no red malicious process nodes → notebook: `XDR: Clean`

**If malicious SHA tied to domain:** red nodes + SHA256 hashes in graph → notebook lists hashes → **you block SHA in Umbrella manually** (domain not blocked unless domain itself malicious — per your note in video 3)

### E. SOC-Interns Google Sheet

- Paste filled block into notebook
- Copy blank template block underneath for next app
- Repeat until 15+ done

### F. Gemini (optional, manual)

- Open Gemini in browser
- Ask whether app is OK for school network
- Paste answer into notebook — extension only opens tab, no API

## What we do NOT automate

- Logging in (you stay logged in)
- Blocking SHA256 in Umbrella (you click block)
- Gemini answers (browser only, your paste)
