# Bundled Node.js Runtime

This directory contains the Windows x64 Node.js runtime used by the packaged LanDock app.

Expected executable:

```text
vendor/node/win-x64/node.exe
```

Tauri bundles this file as a resource. At runtime, Rust resolves it from:

```text
<resource_dir>/_up_/vendor/node/win-x64/node.exe
```

The current bundled binary was copied from:

```text
C:\Program Files\nodejs\node.exe
```

Version:

```text
v24.12.0
```

SHA-256:

```text
2FFE3ACC0458FDDE999F50D11809BBE7C9B7EF204DCF17094E325D26ACE101D8
```
