# Changelog

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
