# Changelog

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
