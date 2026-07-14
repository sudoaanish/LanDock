<div align="center">

<img src="public/logo.png" alt="LanDock logo" width="260" />

# LanDock

### A Windows desktop hub and iPhone web client for local PC control and file sharing.

LanDock turns your Windows PC into a local Wi-Fi hub for your iPhone. Install the Windows MSI, launch LanDock, scan the QR code, and use your iPhone as a local trackpad, live keyboard, clipboard bridge, Screen Peek viewer, and file/image transfer client. No App Store app is required.

<p>
  <a href="https://github.com/sudoaanish/LanDock/releases/latest">
    <img src="https://img.shields.io/github/v/release/sudoaanish/LanDock?style=for-the-badge&label=Latest%20Release" alt="Latest release" />
  </a>
  <a href="https://github.com/sudoaanish/LanDock/releases">
    <img src="https://img.shields.io/badge/Download-MSI-7C3AED?style=for-the-badge&logo=github" alt="Download MSI" />
  </a>
  <a href="https://github.com/sudoaanish/LanDock/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/sudoaanish/LanDock?style=for-the-badge" alt="License" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/Windows-10%2F11-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows 10/11" />
  <img src="https://img.shields.io/badge/iPhone-Web%20Client-000000?style=for-the-badge&logo=apple&logoColor=white" alt="iPhone web client" />
  <img src="https://img.shields.io/badge/Node.js-Bundled-339933?style=for-the-badge&logo=nodedotjs&logoColor=white" alt="Bundled Node.js" />
  <img src="https://img.shields.io/badge/Network-Local%20LAN%20%7C%20Hotspot-success?style=for-the-badge" alt="Local LAN / Hotspot" />
</p>

<p>
  <a href="#features">Features</a> |
  <a href="#install">Install</a> |
  <a href="#connect-an-iphone">Connect an iPhone</a> |
  <a href="#development">Development</a> |
  <a href="#license">License</a>
</p>

</div>

---

Version: `1.2.3`

## Features

- Windows desktop dashboard built with Tauri.
- Self-contained Windows MSI with a bundled Node.js runtime.
- QR-code pairing for the iPhone web client.
- Windows Mobile Hotspot friendly connection flow, with `192.168.137.1` prioritized when present.
- iPhone Add to Home Screen support with LanDock title and icon.
- Multi-touch phone trackpad:
  - one-finger movement and tap
  - two-finger scroll
  - right/middle click gestures
  - drag/select gestures
  - stale-session recovery after iPhone background/resume
- Keyboard controls:
  - live desktop typing from the iPhone keyboard
  - Typing Preview mirror
  - Shift/Ctrl modifier controls
  - safe command buttons for common editing and browser actions
- Clipboard sync between PC and iPhone client.
- Screen Peek:
  - lightweight view-only desktop screenshot
  - manual and optional auto refresh
  - pinch, pan, and Fit viewer controls
- Local file and image transfer between PC and iPhone:
  - Sent to PC history and Shared From PC
  - duplicate-safe received filenames
  - optional client-side image optimization with safe original fallback
- Backend-provided version display in iPhone Settings.
- Runtime diagnostics for backend startup failures.
- Dashboard update-check/install control for signed Tauri updater releases.

## Install

For normal use, download the Windows MSI from the GitHub Releases page and install it:

```text
LanDock_1.2.3_x64_en-US.msi
```

The packaged Windows app includes its own Node.js runtime under the app resources. You do not need to install Node.js to run the MSI build.

## Connect an iPhone

1. Install and launch LanDock on Windows.
2. Turn on Windows Mobile Hotspot if you want the most reliable direct phone-to-PC path.
3. Connect the iPhone to the same Wi-Fi network or to the PC's hotspot.
4. In the LanDock desktop dashboard, scan the QR code with the iPhone camera.
5. If Windows Mobile Hotspot is active, prefer the QR card labeled `Windows Hotspot / Recommended`.
6. The recommended hotspot URL normally uses:

```text
http://192.168.137.1:3731/client.html
```

7. In Safari, use Share > Add to Home Screen to install the LanDock phone client. It should appear with the LanDock title and icon.

## Troubleshooting

If the dashboard says `LanDock backend is not running`, check the backend log:

```text
%LOCALAPPDATA%\com.landock.app\logs\backend.log
```

Fallback log path:

```text
%TEMP%\LanDock\logs\backend.log
```

Common causes:

- Port `3731` is already in use.
- Local firewall/network policy blocks the connection.
- App resources were not installed correctly.

The packaged MSI should not depend on global `node.exe` being available in `PATH`.

## Development

Development from source requires Node.js and Rust.

Install dependencies:

```powershell
npm install
```

Run the local Node backend:

```powershell
npm start
```

Run the Tauri development app:

```powershell
npm run tauri dev
```

Node.js is required for development and source builds only. It is not required for users installing the packaged Windows MSI.

## Build a Windows Release

Use the release build script:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\build_windows.ps1
```

The script runs the Tauri release build, verifies the release executable and bundled resources, and produces:

```text
src-tauri\target\release\bundle\msi\LanDock_1.2.3_x64_en-US.msi
```

On some local Windows environments, WiX `light.exe` can fail during ICE validation because Windows Installer Service validation is unavailable. If the release executable and WiX object were already generated, the script applies the documented local fallback:

```text
light.exe -sval
```

This fallback is only for the developer build environment. It is not a normal user installation step.

## License

LanDock is licensed under the MIT License. See [LICENSE](LICENSE).

Created by Aanish Farrukh / sudoaanish.

Copyright (c) 2026 Aanish Farrukh.
