# LanDock

LanDock is a Windows desktop hub that lets an iPhone control your PC over your local network. It provides a QR-driven phone client for trackpad, keyboard, clipboard sync, and local file transfer workflows without requiring an App Store app.

Version: `1.0.0`

## Features

- Windows desktop dashboard built with Tauri.
- Self-contained packaged app with a bundled Windows Node runtime.
- QR-code pairing for the iPhone web client.
- Windows Mobile Hotspot friendly connection flow, with `192.168.137.1` prioritized when present.
- iPhone Home Screen support with LanDock title/icon metadata.
- Multi-touch phone trackpad:
  - one-finger movement and tap
  - two-finger scroll
  - right/middle click gestures
  - drag/select gestures
- Keyboard and special key controls.
- Clipboard sync between PC and iPhone client.
- Local file and image transfer between PC and iPhone.
- Runtime diagnostics for backend startup failures.

## Install

For normal use, download the Windows MSI from the GitHub Releases page and install it:

```text
LanDock_1.0.0_x64_en-US.msi
```

The packaged Windows app includes its own Node runtime under the app resources. You do not need to install Node.js to run the MSI build.

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
src-tauri\target\release\bundle\msi\LanDock_1.0.0_x64_en-US.msi
```

On some local Windows environments, WiX `light.exe` can fail during ICE validation because Windows Installer Service validation is unavailable. If the release executable and WiX object were already generated, the script applies the documented local fallback:

```text
light.exe -sval
```

This fallback is only for the developer build environment. It is not a normal user installation step.

## Release Checklist

Before tagging a release:

1. Build with `scripts/build_windows.ps1`.
2. Install the MSI on a clean Windows machine or VM.
3. Confirm the app launches without global Node.js installed.
4. Confirm the dashboard shows QR codes.
5. Confirm iPhone connects through `192.168.137.1` when using Windows Mobile Hotspot.
6. Confirm Add to Home Screen shows the LanDock title and icon.

## License

LanDock is licensed under the MIT License. See [LICENSE](LICENSE).

Copyright (c) 2026 Aanish Farrukh.
