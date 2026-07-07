<div align="center">

<img src="public/logo.png" alt="LanDock logo" width="260" />

# LanDock

### A native desktop hub and web portal for controlling your Windows PC and sharing files from your iPhone.

LanDock wraps a local WebSocket server, native Win32 input emulator, and local file sharing protocol in a polished Tauri desktop interface. It turns your iPhone into a multi-touch trackpad, keyboard, universal clipboard sync, and file-sharing dropzone—running entirely over your local network with zero setup and no iPhone app installation.

<p>
  <a href="https://github.com/sudoaanish/LanDock/releases/latest">
    <img src="https://img.shields.io/github/v/release/sudoaanish/LanDock?style=for-the-badge&label=Latest%20Release" alt="Latest release" />
  </a>
  <a href="https://github.com/sudoaanish/LanDock/releases">
    <img src="https://img.shields.io/badge/Download-Releases-7C3AED?style=for-the-badge&logo=github" alt="Download releases" />
  </a>
  <a href="https://github.com/sudoaanish/LanDock/blob/main/LICENSE">
    <img src="https://img.shields.io/github/license/sudoaanish/LanDock?style=for-the-badge" alt="License" />
  </a>
</p>

<p>
  <img src="https://img.shields.io/badge/Windows-10%2F11-0078D4?style=for-the-badge&logo=windows&logoColor=white" alt="Windows 10/11" />
  <img src="https://img.shields.io/badge/iOS-14+-000000?style=for-the-badge&logo=apple&logoColor=white" alt="iOS 14+" />
  <img src="https://img.shields.io/badge/Network-Local%20LAN%20%7C%20Hotspot-success?style=for-the-badge" alt="Local LAN / Hotspot" />
</p>

<p>
  <a href="#key-features">Key Features</a> ·
  <a href="#installation--setup">Setup Guide</a> ·
  <a href="#developer-guide">Developer Guide</a> ·
  <a href="#license">License</a>
</p>

</div>

---

## Key Features

* **Precision Multi-Touch Trackpad:** Emulates a native trackpad on your iPhone with:
  * **1-finger Drag:** Piecewise-accelerated relative mouse movement.
  * **1-finger Tap:** Native left-click.
  * **2-finger Tap / 3-finger Tap:** Right-click and middle-click emulation.
  * **2-finger Drag:** Horizontal and vertical scroll wheel binding (with natural scroll toggle).
  * **Double-tap & Hold:** Window dragging, text selection, and slider adjustments.
* **Hardware-Level Input Emulation:** Calls native Windows `user32.dll` APIs via Koffi FFI to inject low-level mouse and keyboard scan codes.
* **Universal Clipboard Sync:** Automated clipboard syncing. Copying text on your PC pushes it to your iPhone client, and tapping "Paste to PC" on the iPhone writes directly to the Windows clipboard.
* **Bidirectional File & Image Drop (LocalSend Style):**
  * **iPhone ➔ PC:** Send pictures, videos, or documents from iOS Files or Photo Gallery directly to `Downloads/LanDock/` on your PC. Windows Explorer automatically highlights incoming transfers.
  * **PC ➔ iPhone:** Drag and drop files from Windows Explorer onto the LanDock desktop app to push them instantly to the iPhone, rendering inline image previews and bypassing Apple PWA download restrictions.
* **iOS Web App (PWA) Standalone Mode:** Scan one of the generated QR codes on your PC screen with your iPhone Camera and select "Add to Home Screen" to install LanDock as a fullscreen standalone application on your iPhone with no Apple App Store download required.
* **Tauri Desktop Crate:** Configured with a system tray menu, autostart configurations, and background Node.js server child-lifecycle process binding.

---

## Tech Stack

<p>
  <img src="https://img.shields.io/badge/Tauri-24C8DB?style=flat-square&logo=tauri&logoColor=white" alt="Tauri" />
  <img src="https://img.shields.io/badge/Rust-000000?style=flat-square&logo=rust&logoColor=white" alt="Rust" />
  <img src="https://img.shields.io/badge/Node.js-339933?style=flat-square&logo=nodedotjs&logoColor=white" alt="Node.js" />
  <img src="https://img.shields.io/badge/WebSockets-010101?style=flat-square&logo=websocket&logoColor=white" alt="WebSockets" />
  <img src="https://img.shields.io/badge/HTML5-E34F26?style=flat-square&logo=html5&logoColor=white" alt="HTML5" />
  <img src="https://img.shields.io/badge/Vanilla_CSS-1572B6?style=flat-square&logo=css3&logoColor=white" alt="CSS3" />
</p>

- **Frontend Core**: Vanilla CSS Glassmorphism + Javascript
- **Desktop Runtime**: Tauri v2 + Rust Crate
- **Local Server**: Node.js HTTP/WebSocket Router
- **Input Emulation**: Win32 user32 FFI bindings (Koffi)
- **Local Sharing**: Multipart Formidable Parser + CORS Preflight responder

---

## Installation & Setup

### 1. Pre-requisites
- A Windows 10/11 computer.
- An iPhone running iOS 14+.

### 2. Connect Your Devices
For zero-lag performance, connect both devices directly over your local network:
1. Turn on your **Windows Mobile Hotspot** (Settings > Network & Internet > Mobile Hotspot).
2. Connect your **iPhone** to the PC's hotspot Wi-Fi network.

### 3. Run LanDock
1. Download the latest `LanDock.msi` installer or standalone executable from the [Releases](https://github.com/sudoaanish/LanDock/releases) page.
2. Launch `LanDock.exe`.
3. Scan one of the generated QR codes on your PC screen with your iPhone Camera.
4. Tap the **Share** button in Safari, select **Add to Home Screen**, and launch LanDock from your home screen for a fullscreen native app experience!

---

## Developer Guide

### Environment Setup
To build the Tauri application locally, you will need Node.js (v18+) and the Rust compilation toolchain:

```powershell
# Install Node dependencies
npm install

# Add Rust binaries directory to PATH (if not globally registered)
$env:PATH += ";$HOME\.cargo\bin"
```

### Start Development Server
This launches the Node backend server and opens the Tauri native debug interface:
```powershell
npx tauri dev
```

### Build Production Bundle
To compile the standalone Windows executable and generate the `.msi` installers:
```powershell
npx tauri build
```

---

## License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

Copyright © 2026 Aanish Farrukh.
