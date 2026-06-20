# Install the App Discovery Chrome Extension

## Where the source code lives

Full project path on your computer:

```
F:\UNCP_Reaserch\soc analyst automation\app discovery automation\
```

The folder you load into Chrome is **`extension`** inside that path:

```
F:\UNCP_Reaserch\soc analyst automation\app discovery automation\extension
```

### Folder layout

```
app discovery automation/
├── extension/              ← LOAD THIS in Chrome
│   ├── manifest.json
│   ├── background/
│   ├── content/
│   ├── lib/
│   ├── sidepanel/
│   └── icons/
├── docs/                   ← architecture & workflow notes
├── videos rec/             ← your screen recordings
├── README.md
└── INSTALL.md              ← this file
```

---

## How to install (first time)

1. Open **Google Chrome** (same browser you use for Umbrella / XDR / SOC-Interns).
2. In the address bar, go to: **`chrome://extensions`**
3. Turn **Developer mode** ON (top-right toggle).
4. Click **Load unpacked**.
5. Browse to:
   ```
   F:\UNCP_Reaserch\soc analyst automation\app discovery automation\extension
   ```
6. Click **Select Folder**.
7. You should see **SOC App Discovery Assistant** in the list.
8. Click the **puzzle icon** in Chrome toolbar → pin the extension.
9. Click the extension icon → the **side panel** opens on the right.

---

## Before first run

1. Log into **Cisco Umbrella**, **Cisco XDR**, and open **SOC-Interns** Google Sheet in Chrome.
2. In the sheet, **click the cell** where the next App Discovery entry should go.
3. In the extension side panel → **Save notebook tab**.
4. Leave **Dry-run ON** and test **one app** before a batch.

---

## After code updates

1. Go to **`chrome://extensions`**
2. Find **SOC App Discovery Assistant**
3. Click the **Reload** (circular arrow) button on the extension card
4. Close and reopen the side panel

You do **not** need to remove and re-add the extension unless the manifest permissions change.

---

## Troubleshooting

| Problem | Fix |
|--------|-----|
| “Page not ready” | Refresh the Umbrella / XDR tab, then retry |
| Paste does nothing | Click a cell in the sheet, Save notebook tab, turn dry-run OFF |
| Extension not listed | Confirm you selected the `extension` folder, not the parent project folder |
| Side panel empty | Reload extension, click icon again |

---

## Requirements

- Google Chrome (or Chromium-based browser with extension support)
- Already logged into Cisco Umbrella and XDR in that browser
- SOC-Interns Google Sheet open when pasting

No API keys. No separate login. No Python install required.
