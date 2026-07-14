# Changelog

## v1.2.1 - Files, version, and workflow polish

- Added backend-provided app info through `/api/app-info`.
- iPhone Settings now shows the running LanDock version from the backend.
- Added persistent Sent to PC history on the iPhone Files tab.
- Sent to PC items show filename, size, time, and uploading/sent/failed state.
- Kept Shared From PC visible on the iPhone Files tab.
- Renamed the PC Hub file card to Received from iPhone.
- Advanced the PWA cache generation so Home Screen clients receive the updated assets.
- Updated GitHub Actions workflow action versions to address the Node action runtime deprecation warning.
- Preserved Screen Peek, Trackpad, Keyboard, Typing Preview, live typing, Shift/Ctrl modifiers, command layer, Clipboard, Files, QR/network, updater, and WebSocket behavior.

Notes:

- Sent to PC history is local to the current iPhone/browser and capped at 20 items.
- Clearing Safari/PWA site data clears the local sent history.
- No server-side transfer database was added.
- File-transfer compression is not included in v1.2.1.
- Updater endpoint remains GitHub Releases `latest.json`.

## v1.2.0 - Screen Peek

- Added Screen as a fifth iPhone tab.
- Added view-only Screen Peek for lightweight desktop visibility.
- Added manual screenshot Refresh.
- Added optional two-second Auto Refresh, off by default.
- Added a local `/api/screen/snapshot` endpoint that returns no-cache JPEG screenshots.
- Added screenshot viewer controls for pinch zoom, pan, double-tap zoom toggle, and Fit reset.
- Kept screenshot gestures viewer-only; no remote clicking or coordinate mapping was added.
- Added privacy copy explaining that capture occurs only on Refresh or while Auto Refresh is enabled.
- Advanced the PWA cache generation so Home Screen clients receive the new Screen assets.
- Preserved Trackpad, Keyboard, Typing Preview, live typing, Shift/Ctrl modifiers, command layer, Clipboard, Files, QR/network, updater, and WebSocket behavior.

Notes:

- Screen Peek is not full remote desktop streaming.
- Screen Peek does not use WebRTC/video.
- Screen Peek does not save screenshot history.
- Screen Peek uses fixed local capture through the existing LAN-only LanDock server model.
- File-transfer compression is not included in v1.2.0.
- Updater endpoint remains GitHub Releases `latest.json`.

## v1.1.1 - Keyboard command layer

- Added a compact Commands section to the iPhone Keyboard tab.
- Added editing commands for Select All, Copy, Paste, Cut, Undo, Redo, and Save.
- Added browser commands for Find, Reload, New Tab, and Close Tab.
- Added navigation/system commands for Esc, Tab, and Alt+Tab.
- Replaced the redundant command-layer Win chip with Save while preserving the existing large WIN utility key.
- Added explicit whitelisted backend handling for command buttons.
- Suppressed duplicate iPhone synthetic clicks for command buttons.
- Preserved Typing Preview, live desktop typing, Shift/Ctrl modifier behavior, touchpad, clipboard, files, QR/network, updater, and WebSocket behavior.

Notes:

- Command buttons use fixed whitelisted actions, not arbitrary key injection.
- Typing Preview remains a live mirror, not a required send buffer.
- Screen tab / Screen Peek is not included in v1.1.1.
- Clipboard history, snippets, and templates are planned for later.
- Updater endpoint remains GitHub Releases `latest.json`.

## v1.1.0 - Typing Preview and modifier controls

- Added a Typing Preview panel to the iPhone Keyboard tab.
- Typing Preview mirrors native iOS keyboard input while preserving LanDock's live desktop typing behavior.
- Added Clear Preview for the local preview.
- Added stacked SHIFT / CTRL modifier controls.
- Added tap-to-arm and tap-again-to-cancel modifier behavior.
- Added hold-to-modify support for iPhone multi-touch.
- Added supported Shift/Ctrl utility key combinations.
- Preserved existing touchpad, clipboard, files, QR/network, updater, and WebSocket behavior.

Notes:

- Typing Preview is a live mirror, not a required send buffer.
- Screen tab / Screen Peek is not included in v1.1.0.
- Command macros and clipboard history are planned for later v1.1.x releases.
- Updater endpoint remains GitHub Releases `latest.json`.

## v1.0.3 - Dogfood polish

- Improved iPhone client connection state copy so initial connection and reconnect attempts are clearer.
- Added native iOS keyboard-open layout detection for the Keyboard tab.
- Added compact Keyboard tab styling while the native iOS keyboard is open.
- Tuned compact utility key sizing after iPhone dogfood testing.
- Preserved existing touchpad, clipboard, files, QR/network, updater, and WebSocket behavior.

Notes:

- Live Keyboard is not included in v1.0.3.
- Existing utility key behavior is unchanged.
- Updater endpoint remains GitHub Releases `latest.json`.

## v1.0.2

- Released as a release-infrastructure bridge update.
- Bumped the active app/package version to `1.0.2`.
- Moved the updater endpoint for v1.0.2 and later installs to GitHub Releases `latest.json`.
- Preserved legacy `main/update.json` compatibility for installed v1.0.0/v1.0.1 clients.
- Added iPhone Settings modal attribution: `Developed by Aanish Farrukh (sudoaanish)`.
- Manual validation confirmed v1.0.1 updated successfully to v1.0.2, the iPhone client still connects, and core LanDock behavior still works.
