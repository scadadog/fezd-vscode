# FEZD editor extension

VS Code / Cursor / Windsurf client for a **FEZD gateway**. Convert EcoStruxure
Control Expert **`.zef` → `.stu`**, then deploy to the Control Expert simulator
(off-prem hosted gateway) or a plant PLC (on-prem `fezd-server`).

This does **not** replace Control Expert. The Windows host still runs
`fezd-server` and CE. Copia / GitHub Actions should keep using
[`fezd-client`](https://github.com/scadadog/fezd-client).

## Install

**Automatic updates:** install **SCADADOG FEZD** from the [VS Marketplace](https://marketplace.visualstudio.com/items?itemName=scadadog.scadadog-fezd)
once the listing is live (VS Code, Cursor, and Windsurf). The editor
applies new versions; do not sideload if you want OTA.

**Fallback (no auto-update):** download `scadadog-fezd-*.vsix` from
[GitHub Releases](https://github.com/scadadog/fezd-vscode/releases) → Extensions
→ Install from VSIX.

Local build:

```bash
cd fezd-vscode
npm install
npm run package
```

## First-time setup

1. Open Settings and search **FEZD**.
2. **Off-prem:** set `fezd.hosted.url` to the hosted gateway
   (`https://host:8443`).
3. **On-prem:** set `fezd.onPrem.url` to your Windows gateway and
   `fezd.onPrem.plcAddress` to the PLC IP.
4. Command Palette → **FEZD: Set API key** (stored in Secret Storage, not
   `settings.json`). Use the token from `fezd-server license issue`
   (`FEZD_TOKEN`).
5. Optional: **FEZD: Set application password** for protected / M580 archives.
6. Self-signed on-prem TLS: either trust the gateway cert in the OS, or enable
   `fezd.allowInsecureTls`.

The status bar shows **FEZD: Off-prem** or **FEZD: On-prem**. Click it (or
**FEZD: Switch environment**) to change which URL + token + PLC target the next
command uses.

## Commands

| Command | What it does |
|---|---|
| **FEZD: Health** | `GET /healthz`, `/api/v1/whoami`, `/api/v1/version`, `/api/v1/profile` |
| **FEZD: Convert ZEF to STU** | Upload archive → `POST /api/v1/export` (`saveStu`) → download into `artifacts/` |
| **FEZD: Deploy (active profile)** | Upload `.zef`/`.xef`/`.stu`/`.sta` → exclusive session. Off-prem defaults to simulator; on-prem uses the PLC IP |

Explorer context menus appear on those extensions.

Logs stream to the **FEZD** output channel.

## Profiles

| Profile | Gateway | Default target |
|---|---|---|
| Off-prem (`hosted`) | `fezd.hosted.url` | Control Expert PLC Simulator unless `fezd.hosted.plcAddress` is set |
| On-prem (`onPrem`) | `fezd.onPrem.url` | `fezd.onPrem.plcAddress` (required) |

`.stu` uploads are first-class: the gateway opens them with UDE
`OpenApplication` the same way `fezd-server deploy project.stu` does locally.
