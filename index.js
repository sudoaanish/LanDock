const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { WebSocketServer } = require('ws');
const koffi = require('koffi');
const qrcodeTerminal = require('qrcode-terminal');
const QRCode = require('qrcode');
const clipboard = require('clipboardy').default;
const formidable = require('formidable');
const { exec } = require('child_process');
const appPackage = require('./package.json');

let screenshot = null;
try {
    screenshot = require('screenshot-desktop');
} catch (err) {
    console.warn('[Screen Peek] Screenshot support is unavailable:', err.message);
}

const PORT = 3731;
const shareDir = path.join(os.homedir(), 'Downloads', 'LanDock', 'shares');
const MAX_FILENAME_COLLISIONS = 9999;

function sanitizeUploadFilename(filename, fallbackName) {
    const rawName = String(filename || '').replace(/\\/g, '/').split('/').pop() || '';
    let safeName = rawName
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_')
        .replace(/[. ]+$/g, '')
        .trim();

    if (!safeName || safeName === '.' || safeName === '..') {
        safeName = fallbackName;
    }

    const parsed = path.parse(safeName);
    let stem = parsed.name.replace(/[. ]+$/g, '').trim() || fallbackName;
    let extension = parsed.ext.replace(/[. ]+$/g, '');

    if (/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(stem)) {
        stem = `_${stem}`;
    }

    extension = extension.slice(0, 24);
    stem = stem.slice(0, Math.max(1, 180 - extension.length));
    return `${stem}${extension}`;
}

function saveUploadedFile(tempPath, destinationDir, requestedName, fallbackName, callback, attempt = 1) {
    if (!tempPath) {
        callback(new Error('Missing temporary upload path'));
        return;
    }

    if (attempt > MAX_FILENAME_COLLISIONS) {
        callback(new Error('Too many files share this name'));
        return;
    }

    const safeName = sanitizeUploadFilename(requestedName, fallbackName);
    const parsed = path.parse(safeName);
    const candidateName = attempt === 1
        ? safeName
        : `${parsed.name}-${attempt}${parsed.ext}`;
    const targetPath = path.join(destinationDir, candidateName);
    const destinationRoot = `${path.resolve(destinationDir)}${path.sep}`;

    if (!path.resolve(targetPath).startsWith(destinationRoot)) {
        callback(new Error('Invalid upload filename'));
        return;
    }

    fs.copyFile(tempPath, targetPath, fs.constants.COPYFILE_EXCL, (copyErr) => {
        if (copyErr && copyErr.code === 'EEXIST') {
            saveUploadedFile(tempPath, destinationDir, safeName, fallbackName, callback, attempt + 1);
            return;
        }

        if (copyErr) {
            callback(copyErr);
            return;
        }

        fs.unlink(tempPath, (unlinkErr) => {
            if (unlinkErr) {
                console.warn(`[Upload] Saved file but could not remove temporary file: ${unlinkErr.message}`);
            }
            callback(null, { name: candidateName, path: targetPath });
        });
    });
}

function removeTemporaryUpload(fileObj) {
    const tempPath = fileObj && (fileObj.filepath || fileObj.path);
    if (!tempPath) return;
    fs.unlink(tempPath, () => {});
}

// ==========================================
// 1. NATIVE INPUT EMULATION CORE
// ==========================================
let user32, kernel32, SendInput, GetLastError, INPUT_SIZE;
let emulatorSupported = false;

try {
    user32 = koffi.load('user32.dll');
    kernel32 = koffi.load('kernel32.dll');
    
    const MOUSEINPUT = koffi.struct('MOUSEINPUT', {
        dx: 'int32',
        dy: 'int32',
        mouseData: 'uint32',
        dwFlags: 'uint32',
        time: 'uint32',
        dwExtraInfo: 'uintptr'
    });

    const KEYBDINPUT = koffi.struct('KEYBDINPUT', {
        wVk: 'uint16',
        wScan: 'uint16',
        dwFlags: 'uint32',
        time: 'uint32',
        dwExtraInfo: 'uintptr'
    });

    const HARDWAREINPUT = koffi.struct('HARDWAREINPUT', {
        uMsg: 'uint32',
        wParamL: 'uint16',
        wParamH: 'uint16'
    });

    const INPUT_UNION = koffi.union('INPUT_UNION', {
        mi: MOUSEINPUT,
        ki: KEYBDINPUT,
        hi: HARDWAREINPUT
    });

    const INPUT = koffi.struct('INPUT', {
        type: 'uint32',
        u: INPUT_UNION
    });

    SendInput = user32.func('uint32 __stdcall SendInput(uint32 cInputs, INPUT *pInputs, int32 cbSize)');
    GetLastError = kernel32.func('uint32 __stdcall GetLastError()');
    INPUT_SIZE = koffi.sizeof(INPUT);
    emulatorSupported = true;
    console.log('[Emulator] Win32 input emulator successfully loaded. INPUT size:', INPUT_SIZE);
} catch (err) {
    console.warn('[Emulator] Win32 input emulator failed to load (Non-Windows or missing dependencies):', err.message);
}

function emulateInput(inputs) {
    if (!emulatorSupported) return;
    try {
        const result = SendInput(inputs.length, inputs, INPUT_SIZE);
        if (result === 0) {
            const err = GetLastError();
            // Silent error 5 (access denied) when desktop is locked to keep logs clean
            if (err !== 0 && err !== 5) {
                console.warn(`[Emulator] SendInput failed. GetLastError: ${err}`);
            }
        }
    } catch (err) {
        console.error('[Emulator] FFI SendInput call error:', err.message);
    }
}

const MOUSEEVENTF_MOVE = 0x0001;
const MOUSEEVENTF_LEFTDOWN = 0x0002;
const MOUSEEVENTF_LEFTUP = 0x0004;
const MOUSEEVENTF_RIGHTDOWN = 0x0008;
const MOUSEEVENTF_RIGHTUP = 0x0010;
const MOUSEEVENTF_MIDDLEDOWN = 0x0020;
const MOUSEEVENTF_MIDDLEUP = 0x0040;
const MOUSEEVENTF_WHEEL = 0x0800;
const MOUSEEVENTF_HWHEEL = 0x1000;

const KEYEVENTF_KEYUP = 0x0002;
const KEYEVENTF_UNICODE = 0x0004;

const InputEmulator = {
    moveMouseRelative: (dx, dy) => {
        emulateInput([{
            type: 0, // INPUT_MOUSE
            u: {
                mi: { dx, dy, mouseData: 0, dwFlags: MOUSEEVENTF_MOVE, time: 0, dwExtraInfo: 0 }
            }
        }]);
    },
    mouseButton: (button, isDown) => {
        let dwFlags = 0;
        if (button === 0) dwFlags = isDown ? MOUSEEVENTF_LEFTDOWN : MOUSEEVENTF_LEFTUP;
        else if (button === 1) dwFlags = isDown ? MOUSEEVENTF_RIGHTDOWN : MOUSEEVENTF_RIGHTUP;
        else if (button === 2) dwFlags = isDown ? MOUSEEVENTF_MIDDLEDOWN : MOUSEEVENTF_MIDDLEUP;
        
        if (dwFlags !== 0) {
            emulateInput([{
                type: 0,
                u: {
                    mi: { dx: 0, dy: 0, mouseData: 0, dwFlags, time: 0, dwExtraInfo: 0 }
                }
            }]);
        }
    },
    mouseScroll: (deltaX, deltaY) => {
        const inputs = [];
        const scrollFactor = 120; // Windows wheel delta unit
        if (deltaY !== 0) {
            // Negative deltaY scrolls down in Windows
            inputs.push({
                type: 0,
                u: {
                    mi: { dx: 0, dy: 0, mouseData: Math.round(-deltaY * scrollFactor), dwFlags: MOUSEEVENTF_WHEEL, time: 0, dwExtraInfo: 0 }
                }
            });
        }
        if (deltaX !== 0) {
            inputs.push({
                type: 0,
                u: {
                    mi: { dx: 0, dy: 0, mouseData: Math.round(deltaX * scrollFactor), dwFlags: MOUSEEVENTF_HWHEEL, time: 0, dwExtraInfo: 0 }
                }
            });
        }
        if (inputs.length > 0) {
            emulateInput(inputs);
        }
    },
    sendUnicodeText: (text) => {
        const inputs = [];
        for (let i = 0; i < text.length; i++) {
            const charCode = text.charCodeAt(i);
            inputs.push({
                type: 1, // INPUT_KEYBOARD
                u: {
                    ki: { wVk: 0, wScan: charCode, dwFlags: KEYEVENTF_UNICODE, time: 0, dwExtraInfo: 0 }
                }
            });
            inputs.push({
                type: 1,
                u: {
                    ki: { wVk: 0, wScan: charCode, dwFlags: KEYEVENTF_UNICODE | KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 }
                }
            });
        }
        if (inputs.length > 0) {
            emulateInput(inputs);
        }
    },
    sendSpecialKey: (vkCode) => {
        emulateInput([
            {
                type: 1,
                u: {
                    ki: { wVk: vkCode, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 }
                }
            },
            {
                type: 1,
                u: {
                    ki: { wVk: vkCode, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 }
                }
            }
        ]);
    },
    sendKeyCombo: (modifierVkCodes, keyVkCode) => {
        const inputs = [];

        modifierVkCodes.forEach(vkCode => {
            inputs.push({
                type: 1,
                u: {
                    ki: { wVk: vkCode, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 }
                }
            });
        });

        inputs.push({
            type: 1,
            u: {
                ki: { wVk: keyVkCode, wScan: 0, dwFlags: 0, time: 0, dwExtraInfo: 0 }
            }
        });
        inputs.push({
            type: 1,
            u: {
                ki: { wVk: keyVkCode, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 }
            }
        });

        modifierVkCodes.slice().reverse().forEach(vkCode => {
            inputs.push({
                type: 1,
                u: {
                    ki: { wVk: vkCode, wScan: 0, dwFlags: KEYEVENTF_KEYUP, time: 0, dwExtraInfo: 0 }
                }
            });
        });

        emulateInput(inputs);
    }
};

const KEY_MAP = {
    0: 0xAD, // Volume Mute (VK_VOLUME_MUTE)
    1: 0xAE, // Volume Down (VK_VOLUME_DOWN)
    2: 0xAF, // Volume Up (VK_VOLUME_UP)
    3: 0xB3, // Media Play Pause (VK_MEDIA_PLAY_PAUSE)
    4: 0xB1, // Media Prev (VK_MEDIA_PREV_TRACK)
    5: 0xB0, // Media Next (VK_MEDIA_NEXT_TRACK)
    6: 0xA6, // Browser Back (VK_BROWSER_BACK)
    7: 0xA7, // Browser Forward (VK_BROWSER_FORWARD)
    8: 0x5B, // Super/Windows (VK_LWIN)
    9: 0x25, // Left Arrow (VK_LEFT)
    10: 0x27, // Right Arrow (VK_RIGHT)
    11: 0x26, // Up Arrow (VK_UP)
    12: 0x28, // Down Arrow (VK_DOWN)
    13: 0x24, // Home (VK_HOME)
    14: 0x23, // End (VK_END)
    15: 0x08, // Backspace (VK_BACK)
    16: 0x2E, // Delete (VK_DELETE)
    17: 0x0D, // Return/Enter (VK_RETURN)
    18: 0x1B, // Escape (VK_ESCAPE)
    19: 0x20  // Space (VK_SPACE)
};

const MODIFIER_KEY_MAP = {
    shift: 0x10, // VK_SHIFT
    ctrl: 0x11   // VK_CONTROL
};

const COMBO_KEY_MAP = {
    left: 0x25,
    right: 0x27,
    up: 0x26,
    down: 0x28,
    backspace: 0x08,
    delete: 0x2E,
    enter: 0x0D
};

const SUPPORTED_KEY_COMBOS = new Set([
    'shift:enter',
    'shift:backspace',
    'shift:left',
    'shift:right',
    'shift:up',
    'shift:down',
    'ctrl:left',
    'ctrl:right',
    'ctrl:up',
    'ctrl:down',
    'ctrl:backspace',
    'ctrl:delete'
]);

const SUPPORTED_COMMANDS = Object.freeze({
    select_all: { modifiers: [0x11], key: 0x41 },
    copy: { modifiers: [0x11], key: 0x43 },
    paste: { modifiers: [0x11], key: 0x56 },
    cut: { modifiers: [0x11], key: 0x58 },
    undo: { modifiers: [0x11], key: 0x5A },
    redo: { modifiers: [0x11], key: 0x59 },
    find: { modifiers: [0x11], key: 0x46 },
    refresh: { modifiers: [0x11], key: 0x52 },
    new_tab: { modifiers: [0x11], key: 0x54 },
    close_tab: { modifiers: [0x11], key: 0x57 },
    escape: { key: 0x1B },
    tab: { key: 0x09 },
    alt_tab: { modifiers: [0x12], key: 0x09 },
    save: { modifiers: [0x11], key: 0x53 }
});

function sendSupportedKeyCombo(modifiers, key) {
    if (!Array.isArray(modifiers) || modifiers.length !== 1 || typeof key !== 'string') {
        return false;
    }

    const modifier = String(modifiers[0]).toLowerCase();
    const keyName = key.toLowerCase();
    const comboId = `${modifier}:${keyName}`;

    if (!SUPPORTED_KEY_COMBOS.has(comboId)) {
        return false;
    }

    const modifierVkCode = MODIFIER_KEY_MAP[modifier];
    const keyVkCode = COMBO_KEY_MAP[keyName];
    if (!modifierVkCode || !keyVkCode) {
        return false;
    }

    InputEmulator.sendKeyCombo([modifierVkCode], keyVkCode);
    return true;
}

function sendSupportedCommand(command) {
    if (typeof command !== 'string') {
        return false;
    }

    if (!Object.prototype.hasOwnProperty.call(SUPPORTED_COMMANDS, command)) {
        return false;
    }

    const action = SUPPORTED_COMMANDS[command];
    if (action.modifiers) {
        InputEmulator.sendKeyCombo(action.modifiers, action.key);
    } else {
        InputEmulator.sendSpecialKey(action.key);
    }
    return true;
}

// ==========================================
// 2. NETWORK & CLIPBOARD UTILITIES
// ==========================================
let lastClipboardText = '';

function getLocalIPs() {
    const interfaces = os.networkInterfaces();
    const candidates = [];
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                candidates.push(classifyNetworkAddress(net.address, name));
            }
        }
    }
    return orderNetworkCandidates(candidates);
}

function classifyNetworkAddress(ip, interfaceName) {
    const lowerName = interfaceName.toLowerCase();
    const parts = ip.split('.').map(Number);
    const [a, b, c, d] = parts;

    const isHotspot = ip === '192.168.137.1';
    const isLinkLocal = a === 169 && b === 254;
    const isPrivate =
        a === 10 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 168);
    const isCgnat = a === 100 && b >= 64 && b <= 127;
    const isKnownHostOnlyRange = a === 192 && b === 168 && c === 56;
    const isVirtualAdapter = /(virtualbox|vmware|hyper-v|vethernet|virtual|loopback|wsl)/i.test(interfaceName);
    const isVpnAdapter = /(tailscale|zerotier|vpn|wireguard|openvpn|tun|tap)/i.test(interfaceName) || isCgnat;

    let priority = 50;
    let label = 'Network Adapter';
    let hidden = false;
    let reason = '';

    if (isHotspot) {
        priority = 0;
        label = 'Windows Hotspot / Recommended';
    } else if (isLinkLocal) {
        priority = 90;
        label = 'Link-local';
        hidden = true;
        reason = 'Link-local 169.254.x.x addresses are usually not reachable from iPhone clients.';
    } else if (isVirtualAdapter || isKnownHostOnlyRange) {
        priority = 80;
        label = 'Virtual Adapter';
        hidden = true;
        reason = 'Virtual machine adapters are usually not reachable from the phone.';
    } else if (isVpnAdapter) {
        priority = 85;
        label = 'VPN Adapter';
        hidden = true;
        reason = 'VPN or CGNAT-style adapters are usually not reachable from the phone.';
    } else if (isPrivate) {
        priority = a === 192 ? 10 : a === 10 ? 20 : 30;
        label = 'Private LAN';
    } else {
        priority = 70;
        label = 'Advanced Adapter';
        hidden = true;
        reason = 'Non-private addresses are unlikely to work for local iPhone LAN pairing.';
    }

    return {
        ip,
        interfaceName,
        label,
        priority,
        hidden,
        reason,
        recommended: isHotspot,
        octets: [a, b, c, d]
    };
}

function orderNetworkCandidates(candidates) {
    const sorted = candidates.sort((left, right) => {
        if (left.priority !== right.priority) return left.priority - right.priority;
        return left.ip.localeCompare(right.ip, undefined, { numeric: true });
    });

    const visible = sorted.filter(item => !item.hidden);
    const hidden = sorted.filter(item => item.hidden);

    if (visible.length > 0) {
        return { visible, hidden };
    }

    const fallbackVisible = hidden.filter(item => !item.ip.startsWith('169.254.'));
    if (fallbackVisible.length > 0) {
        return {
            visible: fallbackVisible.map(item => ({
                ...item,
                hidden: false,
                label: `${item.label} / Fallback`
            })),
            hidden: hidden.filter(item => item.ip.startsWith('169.254.'))
        };
    }

    return { visible: [], hidden };
}

function getLastClipboard() {
    try {
        const text = clipboard.readSync();
        lastClipboardText = text;
        return text;
    } catch (err) {
        return lastClipboardText;
    }
}

function setSystemClipboard(text) {
    if (text === lastClipboardText) return;
    try {
        clipboard.writeSync(text);
        lastClipboardText = text;
        console.log('[Clipboard] PC clipboard updated from client.');
        broadcast({ type: 'clipboard_sync', text }, null);
    } catch (err) {
        console.error('[Clipboard] Failed to write to PC clipboard:', err.message);
    }
}

function revealInExplorer(filePath) {
    if (process.platform !== 'win32') return;
    exec(`explorer.exe /select,"${filePath}"`, (err) => {
        if (err) {
            console.error('[Explorer] Failed to reveal file:', err.message);
        }
    });
}

let activeScreenCapture = null;

function captureScreenSnapshot() {
    if (!screenshot) {
        return Promise.reject(new Error('Screenshot support is unavailable.'));
    }

    if (!activeScreenCapture) {
        activeScreenCapture = screenshot({ format: 'jpg' })
            .finally(() => {
                activeScreenCapture = null;
            });
    }
    return activeScreenCapture;
}

function setScreenNoCacheHeaders(res) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
}

// ==========================================
// 3. HTTP STATIC & API SERVER
// ==========================================
const MIME_TYPES = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
    let urlPath = req.url;
    const requestPath = new URL(req.url, 'http://localhost').pathname;
    console.log(`[HTTP] ${req.method} ${urlPath}`);

    // Enable CORS for local network sharing (essential for iOS Safari)
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.statusCode = 204;
        res.end();
        return;
    }

    if (requestPath === '/api/screen/snapshot') {
        setScreenNoCacheHeaders(res);

        if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('Allow', 'GET');
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ error: 'Method not allowed' }));
            return;
        }

        captureScreenSnapshot()
            .then(image => {
                res.statusCode = 200;
                res.setHeader('Content-Type', 'image/jpeg');
                res.setHeader('Content-Length', image.length);
                res.end(image);
            })
            .catch(err => {
                console.error('[Screen Peek] Capture failed:', err.message);
                const publicError = err.message === 'Screenshot support is unavailable.'
                    ? 'Screen Peek is unavailable in this installation.'
                    : 'Screen capture failed. The Windows desktop may be locked or unavailable.';
                res.statusCode = 503;
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({ error: publicError }));
            });
        return;
    }

    // API Upload Route (iPhone -> PC)
    if (urlPath.startsWith('/api/upload') && req.method === 'POST') {
        const uploadDir = path.join(os.homedir(), 'Downloads', 'LanDock');
        if (!fs.existsSync(uploadDir)) {
            fs.mkdirSync(uploadDir, { recursive: true });
        }

        const form = new formidable.IncomingForm({
            uploadDir: uploadDir,
            keepExtensions: true,
            maxFileSize: 100 * 1024 * 1024 // 100MB
        });

        form.parse(req, (err, fields, files) => {
            if (err) {
                console.error('[Upload] Error parsing form:', err.message);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Upload failed: ' + err.message }));
                return;
            }

            let fileObj = files.file;
            if (Array.isArray(fileObj)) fileObj = fileObj[0];

            if (!fileObj) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'No file uploaded' }));
                return;
            }

            const originalName = fileObj.originalFilename || fileObj.name || 'uploaded_file';
            const tempPath = fileObj.filepath || fileObj.path;

            saveUploadedFile(tempPath, uploadDir, originalName, 'uploaded_file', (saveErr, savedFile) => {
                if (saveErr) {
                    removeTemporaryUpload(fileObj);
                    console.error('[Upload] Error saving file:', saveErr.message);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'Failed to save file' }));
                    return;
                }

                console.log(`[Upload] File saved: ${savedFile.path}`);
                broadcast({
                    type: 'file_received',
                    name: savedFile.name,
                    size: fileObj.size,
                    path: savedFile.path
                }, null);

                revealInExplorer(savedFile.path);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    success: true,
                    originalName,
                    name: savedFile.name,
                    size: fileObj.size
                }));
            });
        });
        return;
    }

    // API Share Route (PC -> iPhone)
    if (urlPath.startsWith('/api/share') && req.method === 'POST') {
        if (!fs.existsSync(shareDir)) {
            fs.mkdirSync(shareDir, { recursive: true });
        }

        const form = new formidable.IncomingForm({
            uploadDir: shareDir,
            keepExtensions: true,
            maxFileSize: 100 * 1024 * 1024 // 100MB
        });

        form.parse(req, (err, fields, files) => {
            if (err) {
                console.error('[Share] Error parsing form:', err.message);
                res.statusCode = 500;
                res.end(JSON.stringify({ error: 'Share failed: ' + err.message }));
                return;
            }

            let fileObj = files.file;
            if (Array.isArray(fileObj)) fileObj = fileObj[0];

            if (!fileObj) {
                res.statusCode = 400;
                res.end(JSON.stringify({ error: 'No file uploaded' }));
                return;
            }

            const originalName = fileObj.originalFilename || fileObj.name || 'shared_file';
            const tempPath = fileObj.filepath || fileObj.path;

            saveUploadedFile(tempPath, shareDir, originalName, 'shared_file', (saveErr, savedFile) => {
                if (saveErr) {
                    removeTemporaryUpload(fileObj);
                    console.error('[Share] Error saving file:', saveErr.message);
                    res.statusCode = 500;
                    res.end(JSON.stringify({ error: 'Failed to save shared file' }));
                    return;
                }

                console.log(`[Share] File shared: ${savedFile.name}`);
                broadcast({
                    type: 'file_available',
                    name: savedFile.name,
                    size: fileObj.size,
                    url: `/shares/${encodeURIComponent(savedFile.name)}`
                }, null);

                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify({
                    success: true,
                    originalName,
                    name: savedFile.name,
                    size: fileObj.size
                }));
            });
        });
        return;
    }

    // API Reveal Route (Windows Explorer focus)
    if (urlPath.startsWith('/api/reveal')) {
        const parsedUrl = new URL(req.url, 'http://localhost');
        const filePath = parsedUrl.searchParams.get('path');
        if (filePath) {
            revealInExplorer(filePath);
            res.setHeader('Content-Type', 'application/json');
            res.end(JSON.stringify({ success: true }));
        } else {
            res.statusCode = 400;
            res.end(JSON.stringify({ error: 'Missing path' }));
        }
        return;
    }

    // Lightweight app metadata for web clients.
    if (urlPath === '/api/app-info') {
        if (req.method !== 'GET') {
            res.statusCode = 405;
            res.setHeader('Allow', 'GET');
            res.end();
            return;
        }

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify({
            name: 'LanDock',
            version: appPackage.version
        }));
        return;
    }

    // API Status Endpoint
    if (urlPath === '/api/status') {
        res.setHeader('Content-Type', 'application/json');
        const networkAddresses = getLocalIPs();
        const promises = networkAddresses.visible.map(item => {
            const clientUrl = `http://${item.ip}:${PORT}/client.html`;
            return QRCode.toDataURL(clientUrl)
                .then(qrDataUrl => ({
                    ip: item.ip,
                    url: clientUrl,
                    qr: qrDataUrl,
                    label: item.label,
                    interfaceName: item.interfaceName,
                    recommended: item.recommended
                }))
                .catch(() => ({
                    ip: item.ip,
                    url: clientUrl,
                    qr: '',
                    label: item.label,
                    interfaceName: item.interfaceName,
                    recommended: item.recommended
                }));
        });

        Promise.all(promises).then(data => {
            res.end(JSON.stringify({
                status: 'ok',
                server: 'running',
                port: PORT,
                timestamp: new Date().toISOString(),
                ips: data,
                hiddenIps: networkAddresses.hidden.map(item => ({
                    ip: item.ip,
                    label: item.label,
                    interfaceName: item.interfaceName,
                    reason: item.reason
                })),
                clipboard: getLastClipboard(),
                connectionsCount: connectedClients.size - dashboardClients.size
            }));
        }).catch(err => {
            res.statusCode = 500;
            res.end(JSON.stringify({ error: err.message }));
        });
        return;
    }

    if (urlPath === '/' || urlPath === '/index.html') {
        urlPath = '/index.html';
    }

    let filePath;
    if (urlPath.startsWith('/shares/')) {
        const fileName = decodeURIComponent(urlPath.substring(8)); // strip "/shares/"
        filePath = path.join(shareDir, fileName);
    } else {
        filePath = path.join(__dirname, 'public', urlPath);
    }
    
    // Directory traversal security check
    const publicDir = path.join(__dirname, 'public');
    if (urlPath.startsWith('/shares/')) {
        if (!filePath.startsWith(shareDir)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
        }
    } else {
        if (!filePath.startsWith(publicDir)) {
            res.statusCode = 403;
            res.end('Forbidden');
            return;
        }
    }

    fs.readFile(filePath, (err, content) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.statusCode = 404;
                res.end('Not Found');
            } else {
                res.statusCode = 500;
                res.end('Internal Server Error: ' + err.code);
            }
        } else {
            const ext = path.extname(filePath).toLowerCase();
            res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
            res.end(content);
        }
    });
});

// ==========================================
// 4. WEBSOCKET REALTIME ROUTER
// ==========================================
const wss = new WebSocketServer({ server });
const connectedClients = new Set();
const dashboardClients = new Set();

function broadcast(msgObj, excludeWs) {
    const payload = JSON.stringify(msgObj);
    for (const client of connectedClients) {
        if (client !== excludeWs && client.readyState === 1) {
            client.send(payload);
        }
    }
}

wss.on('connection', (ws) => {
    connectedClients.add(ws);
    broadcastStatusUpdate();

    // Send initial clipboard state
    ws.send(JSON.stringify({ type: 'clipboard_sync', text: getLastClipboard() }));

    ws.on('message', (message) => {
        try {
            const dataStr = message.toString();

            // Web-Socket Streams Protocol (Optimized for minimal parsing overhead)
            if (dataStr.startsWith('m')) {
                // Mouse Relative Move
                const [dx, dy] = dataStr.substring(1).split(';').map(Number);
                if (!isNaN(dx) && !isNaN(dy)) {
                    InputEmulator.moveMouseRelative(dx, dy);
                    logEvent(`Mouse Move: dx=${dx}, dy=${dy}`);
                }
            } else if (dataStr.startsWith('s') || dataStr.startsWith('S')) {
                // Mouse Scroll
                const finish = dataStr.startsWith('S');
                if (dataStr.length > 1) {
                    const [dx, dy] = dataStr.substring(1).split(';').map(Number);
                    if (!isNaN(dx) && !isNaN(dy)) {
                        InputEmulator.mouseScroll(dx, dy);
                        logEvent(`Scroll: dx=${dx}, dy=${dy} (finish=${finish})`);
                    }
                }
            } else if (dataStr.startsWith('b')) {
                // Mouse Buttons
                const [btn, press] = dataStr.substring(1).split(';').map(Number);
                if (!isNaN(btn) && !isNaN(press)) {
                    InputEmulator.mouseButton(btn, press === 1);
                    logEvent(`Mouse Button: btn=${btn}, isDown=${press === 1}`);
                }
            } else if (dataStr.startsWith('k')) {
                // Keyboard Special Keys
                const keyIdx = Number(dataStr.substring(1));
                if (!isNaN(keyIdx) && KEY_MAP[keyIdx] !== undefined) {
                    InputEmulator.sendSpecialKey(KEY_MAP[keyIdx]);
                    logEvent(`Special Key: index=${keyIdx}, vkCode=${KEY_MAP[keyIdx]}`);
                }
            } else if (dataStr.startsWith('t')) {
                // Keyboard Unicode Type
                const text = dataStr.substring(1);
                InputEmulator.sendUnicodeText(text);
                logEvent(`Keyboard Text: "${text}"`);
            } else {
                // JSON Commands
                const payload = JSON.parse(dataStr);
                if (payload.type === 'clipboard_push') {
                    setSystemClipboard(payload.text);
                    logEvent(`Clipboard Push: "${payload.text.substring(0, 30)}${payload.text.length > 30 ? '...' : ''}"`);
                } else if (payload.type === 'key_combo') {
                    const sent = sendSupportedKeyCombo(payload.modifiers, payload.key);
                    if (sent) {
                        logEvent(`Key Combo: ${payload.modifiers.join('+')}+${payload.key}`);
                    } else {
                        logEvent('Ignored unsupported key combo request.');
                    }
                } else if (payload.type === 'command') {
                    const sent = sendSupportedCommand(payload.command);
                    if (sent) {
                        logEvent(`Keyboard Command: ${payload.command}`);
                    } else {
                        logEvent('Ignored unsupported keyboard command request.');
                    }
                } else if (payload.type === 'register_dashboard') {
                    ws.isDashboard = true;
                    dashboardClients.add(ws);
                    broadcastStatusUpdate();
                    logEvent('PC Dashboard registered.');
                } else if (payload.type === 'ping') {
                    ws.send(JSON.stringify({ type: 'pong', time: payload.time }));
                }
            }
        } catch (err) {
            console.error('[WS] Error processing message:', err.message);
        }
    });

    ws.on('close', () => {
        connectedClients.delete(ws);
        dashboardClients.delete(ws);
        broadcastStatusUpdate();
    });
});

function broadcastStatusUpdate() {
    const clientCount = connectedClients.size - dashboardClients.size;
    const statusPayload = JSON.stringify({
        type: 'status_update',
        connectionsCount: Math.max(0, clientCount)
    });
    for (const db of dashboardClients) {
        if (db.readyState === 1) {
            db.send(statusPayload);
        }
    }
}

function logEvent(msg) {
    const time = new Date().toLocaleTimeString();
    const eventPayload = JSON.stringify({ type: 'log_event', time, msg });
    for (const db of dashboardClients) {
        if (db.readyState === 1) {
            db.send(eventPayload);
        }
    }
}

// Background Clipboard Polling (Runs every 1.5 seconds to detect external updates on PC)
setInterval(() => {
    try {
        const currentText = clipboard.readSync();
        if (currentText !== lastClipboardText) {
            lastClipboardText = currentText;
            console.log('[Clipboard] PC clipboard updated locally. Syncing with mobile clients...');
            broadcast({ type: 'clipboard_sync', text: currentText }, null);
            logEvent('PC clipboard changed locally.');
        }
    } catch (err) {
        // Suppress reading errors when clipboard is locked
    }
}, 1500);

// ==========================================
// 5. SERVER RUNTIME INITIALIZATION
// ==========================================
server.listen(PORT, '0.0.0.0', () => {
    console.log(`\n======================================================`);
    console.log(`   LanDock Server (v0.1) — Started Successfully!`);
    console.log(`   Listening Port: ${PORT}`);
    console.log(`======================================================\n`);
    
    const networkAddresses = getLocalIPs();
    console.log('1. Connect iPhone to the same local router / Mobile Hotspot.');
    console.log('2. Open your iPhone camera and scan one of the QR codes below:\n');
    
    networkAddresses.visible.forEach(item => {
        const clientUrl = `http://${item.ip}:${PORT}/client.html`;
        console.log(`  🔗 Connection Endpoint: ${clientUrl}`);
        console.log(`     ${item.label} (${item.interfaceName})`);
        console.log(`     Scan code for ${item.ip}:`);
        qrcodeTerminal.generate(clientUrl, { small: true });
        console.log('\n');
    });

    if (networkAddresses.hidden.length > 0) {
        console.log('Hidden non-primary adapters:');
        networkAddresses.hidden.forEach(item => {
            console.log(`  - ${item.ip} (${item.interfaceName}): ${item.reason}`);
        });
        console.log('\n');
    }

    console.log(`------------------------------------------------------`);
    console.log(`  🖥️  PC Admin Dashboard: http://localhost:${PORT}/index.html`);
    console.log(`======================================================\n`);
});
