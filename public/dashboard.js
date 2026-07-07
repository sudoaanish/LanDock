document.addEventListener('DOMContentLoaded', () => {
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const connectionsCount = document.getElementById('connections-count');
    const connectionList = document.getElementById('connection-list');
    const clipboardArea = document.getElementById('clipboard-area');
    const logList = document.getElementById('log-list');

    const clearClipBtn = document.getElementById('clear-clip-btn');
    const copyClipBtn = document.getElementById('copy-clip-btn');
    const syncClipBtn = document.getElementById('sync-clip-btn');

    let socket;
    let isConnected = false;

    function getHost() {
        let host = window.location.host;
        if (!host || host.includes('tauri') || host.includes('package') || window.location.protocol === 'tauri:' || window.location.protocol === 'data:') {
            return 'localhost:3731';
        }
        return host;
    }

    function showBackendFailure() {
        statusIndicator.className = 'glow-indicator disconnected';
        if (statusText) statusText.textContent = 'Backend Offline';
        updateConnectionsBadge(0);

        connectionList.innerHTML = `
            <div class="glass-card fade-in" style="padding: 18px; border-color: rgba(248,113,113,0.35); background: rgba(127,29,29,0.18);">
                <div style="font-weight: 700; color: #fecaca; margin-bottom: 10px;">LanDock backend is not running.</div>
                <div style="font-size: 13px; line-height: 1.55; color: var(--text-muted); text-align: left;">
                    <div style="margin-bottom: 8px;">QR codes cannot be generated until the local backend is reachable on port 3731.</div>
                    <div style="font-weight: 600; color: var(--text-main); margin-bottom: 4px;">Likely causes:</div>
                    <ul style="margin: 0 0 10px 18px; padding: 0;">
                        <li>Node.js is missing or not in PATH.</li>
                        <li>Backend failed to start.</li>
                        <li>Port 3731 is blocked or already in use.</li>
                    </ul>
                    <div style="word-break: break-word;">Check the backend log at <code>%LOCALAPPDATA%\\com.landock.app\\logs\\backend.log</code>. If that file is not present, check <code>%TEMP%\\LanDock\\logs\\backend.log</code>.</div>
                </div>
            </div>
        `;
    }

    // 1. Fetch IP Addresses & QR Codes
    async function loadStatus() {
        try {
            const host = getHost();
            const res = await fetch(`http://${host}/api/status`);
            if (!res.ok) {
                throw new Error(`Status API returned HTTP ${res.status}`);
            }
            const data = await res.json();
            
            // Render QR Cards
            if (data.ips && data.ips.length > 0) {
                connectionList.innerHTML = '';
                data.ips.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'qr-card glass-card fade-in';
                    const label = item.label || 'Network Adapter';
                    const recommended = item.recommended ? '<div style="font-size: 11px; color: #34d399; font-weight: 700; margin-top: 4px;">Recommended</div>' : '';
                    card.innerHTML = `
                        <div style="font-weight: 600; font-size: 14px; color: var(--accent);">${item.ip}</div>
                        <div style="font-size: 12px; color: var(--text-muted); margin-top: 4px;">${label}</div>
                        ${recommended}
                        <img src="${item.qr}" alt="QR Code for ${item.ip}">
                        <div class="endpoint-url">${item.url}</div>
                    `;
                    connectionList.appendChild(card);
                });
            } else {
                connectionList.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding-top: 50px;">No network adapters detected. Check network connection.</div>';
            }

            // Sync clipboard text
            if (data.clipboard) {
                clipboardArea.value = data.clipboard;
            }

            updateConnectionsBadge(data.connectionsCount || 0);
        } catch (err) {
            console.error('Failed to load status API:', err);
            showBackendFailure();
            addLog('System', 'Failed to retrieve connection adapters from API.');
        }
    }

    // 2. Setup WebSockets for Real-time sync & logs
    function connectSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = getHost();
        socket = new WebSocket(`${protocol}//${host}`);

        socket.onopen = () => {
            isConnected = true;
            statusIndicator.className = 'glow-indicator';
            addLog('System', 'Connected to WebSocket core.');
            
            // Register as Dashboard to receive log feeds and client updates
            socket.send(JSON.stringify({ type: 'register_dashboard' }));
        };

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                if (msg.type === 'status_update') {
                    updateConnectionsBadge(msg.connectionsCount);
                } else if (msg.type === 'clipboard_sync') {
                    clipboardArea.value = msg.text;
                    addLog('Clipboard', `Synced: "${msg.text.substring(0, 20)}${msg.text.length > 20 ? '...' : ''}"`);
                } else if (msg.type === 'log_event') {
                    addLog(msg.time, msg.msg, true);
                } else if (msg.type === 'file_received') {
                    addLog('Files', `Received file from iPhone: ${msg.name}`);
                    appendReceivedFile(msg.name, msg.size, msg.path);
                }
            } catch (err) {
                // Ignore text commands echoed back or unhandled types
            }
        };

        socket.onclose = () => {
            isConnected = false;
            statusIndicator.className = 'glow-indicator disconnected';
            updateConnectionsBadge(0);
            addLog('System', 'WebSocket connection lost. Reconnecting in 3s...');
            setTimeout(connectSocket, 3000);
        };

        socket.onerror = (err) => {
            console.error('WebSocket Error:', err);
        };
    }

    // 3. UI Helper functions
    function updateConnectionsBadge(count) {
        connectionsCount.textContent = `${count} client${count === 1 ? '' : 's'}`;
    }

    function addLog(timeOrTag, message, isRealTime = false) {
        const entry = document.createElement('div');
        entry.className = 'log-entry fade-in';
        entry.innerHTML = `
            <span class="log-time">[${timeOrTag}]</span>
            <span class="log-message">${escapeHtml(message)}</span>
        `;
        logList.appendChild(entry);
        
        // Auto Scroll to bottom
        logList.scrollTop = logList.scrollHeight;
        
        // Limit total log count to 100 entries to prevent memory overflow
        while (logList.childElementCount > 100) {
            logList.removeChild(logList.firstChild);
        }
    }

    function escapeHtml(text) {
        return text
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    }

    // 4. Clipboard Controls
    syncClipBtn.addEventListener('click', () => {
        const text = clipboardArea.value;
        if (isConnected) {
            socket.send(JSON.stringify({
                type: 'clipboard_push',
                text: text
            }));
            addLog('Clipboard', 'Pushed new clipboard content to system and clients.');
        } else {
            alert('Cannot sync: Server disconnected.');
        }
    });

    clearClipBtn.addEventListener('click', () => {
        clipboardArea.value = '';
        if (isConnected) {
            socket.send(JSON.stringify({
                type: 'clipboard_push',
                text: ''
            }));
        }
    });

    copyClipBtn.addEventListener('click', () => {
        clipboardArea.select();
        document.execCommand('copy');
        
        const originalText = copyClipBtn.textContent;
        copyClipBtn.textContent = 'Copied!';
        copyClipBtn.style.borderColor = 'var(--success)';
        setTimeout(() => {
            copyClipBtn.textContent = originalText;
            copyClipBtn.style.borderColor = '';
        }, 1500);
    });

    // ==========================================
    // 5. IMAGE & FILE SHARING CORE
    // ==========================================
    const receivedFilesList = document.getElementById('received-files-list');
    const dragOverlay = document.getElementById('drag-overlay');

    function appendReceivedFile(name, size, filePath) {
        if (!receivedFilesList) return;

        // Clear empty state
        if (receivedFilesList.querySelector('div') && receivedFilesList.querySelector('div').textContent.includes('Awaiting files')) {
            receivedFilesList.innerHTML = '';
        }

        const sizeStr = formatBytes(size);
        const card = document.createElement('div');
        card.className = 'glass-card fade-in';
        card.style.display = 'flex';
        card.style.alignItems = 'center';
        card.style.justifyContent = 'space-between';
        card.style.padding = '8px 12px';
        card.style.margin = '4px 0';
        card.style.border = '1px solid rgba(255,255,255,0.03)';
        card.style.background = 'rgba(255,255,255,0.005)';

        card.innerHTML = `
            <div style="display: flex; align-items: center; gap: 8px; width: 65%;">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent); flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                <div style="font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-main);">${name} (${sizeStr})</div>
            </div>
        `;

        const btn = document.createElement('button');
        btn.className = 'secondary';
        btn.style.padding = '4px 10px';
        btn.style.fontSize = '11px';
        btn.style.fontWeight = '600';
        btn.style.borderRadius = '6px';
        btn.style.width = 'auto';
        btn.style.height = 'auto';
        btn.textContent = 'Folder';
        btn.addEventListener('click', () => {
            revealPath(filePath);
        });

        card.appendChild(btn);
        receivedFilesList.insertBefore(card, receivedFilesList.firstChild);
    }

    function revealPath(filePath) {
        const host = getHost();
        fetch(`http://${host}/api/reveal?path=${encodeURIComponent(filePath)}`)
            .catch(err => console.error('Failed to request file reveal:', err));
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Drag & Drop Upload Handlers
    window.addEventListener('dragenter', (e) => {
        e.preventDefault();
        if (dragOverlay) dragOverlay.style.display = 'flex';
    });

    window.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    if (dragOverlay) {
        window.addEventListener('dragleave', (e) => {
            if (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight) {
                dragOverlay.style.display = 'none';
            }
        });
    }

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        if (dragOverlay) dragOverlay.style.display = 'none';

        const files = e.dataTransfer.files;
        if (files.length > 0) {
            uploadSharedFiles(files);
        }
    });

    function uploadSharedFiles(files) {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            addLog('System', `Sharing file with iPhone: ${file.name} (${formatBytes(file.size)})...`);
            
            const formData = new FormData();
            formData.append('file', file);

            const xhr = new XMLHttpRequest();
            const host = getHost();
            
            xhr.onload = () => {
                if (xhr.status === 200) {
                    addLog('System', `Shared file successfully: ${file.name}`);
                } else {
                    addLog('System', `Failed to share file: ${file.name}`);
                }
            };
            
            
            xhr.onerror = () => {
                addLog('System', `Error sharing file: ${file.name}`);
            };

            xhr.open('POST', `http://${host}/api/share`, true);
            xhr.send(formData);
        }
    }

    // Autoupdater Logic (Tauri context only)
    if (window.__TAURI__) {
        const { check } = window.__TAURI__.updater;
        const { relaunch } = window.__TAURI__.process;
        const { getVersion } = window.__TAURI__.app;

        const checkBtn = document.getElementById('check-updates-btn');
        const statusContainer = document.getElementById('updater-status-container');
        const appVersionLabel = document.getElementById('app-version-label');
        
        let updateInfo = null;
        let updateStatus = 'idle'; // idle, checking, ready, downloading, installing

        // Set local app version dynamically
        getVersion().then(version => {
            if (appVersionLabel) appVersionLabel.textContent = `LanDock Hub v${version}`;
        }).catch(err => console.error('[Updater] Failed to get app version:', err));

        async function checkForUpdates(manual = false) {
            if (updateStatus === 'checking' || updateStatus === 'downloading' || updateStatus === 'installing') return;
            
            try {
                updateStatus = 'checking';
                statusContainer.innerHTML = `<span style="color: var(--accent);">• Checking...</span>`;
                
                const update = await check();
                if (update) {
                    updateInfo = update;
                    updateStatus = 'ready';
                    statusContainer.innerHTML = `
                        <button id="install-update-btn" style="background: linear-gradient(135deg, var(--accent), #0891b2); color: white; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 600; cursor: pointer; box-shadow: 0 0 8px var(--accent-glow); font-family: inherit;">
                            Install v${update.version}
                        </button>
                    `;
                    document.getElementById('install-update-btn').addEventListener('click', installUpdate);
                    
                    if (!manual) {
                        addLog('System', `Updates found! v${update.version} is available for installation.`);
                    }
                } else {
                    updateStatus = 'idle';
                    statusContainer.innerHTML = `<button id="check-updates-btn" style="background: none; border: none; color: var(--text-muted); cursor: pointer; text-decoration: underline; font-family: inherit; font-size: inherit; padding: 0;">(Check for Updates)</button>`;
                    document.getElementById('check-updates-btn').addEventListener('click', () => checkForUpdates(true));
                    if (manual) {
                        alert('LanDock is already up to date!');
                    }
                }
            } catch (err) {
                console.error('[Updater] Update check failed:', err);
                updateStatus = 'idle';
                statusContainer.innerHTML = `<button id="check-updates-btn" style="background: none; border: none; color: var(--text-muted); cursor: pointer; text-decoration: underline; font-family: inherit; font-size: inherit; padding: 0;">(Check for Updates)</button>`;
                document.getElementById('check-updates-btn').addEventListener('click', () => checkForUpdates(true));
            }
        }

        async function installUpdate() {
            if (!updateInfo) return;
            try {
                updateStatus = 'downloading';
                statusContainer.innerHTML = `<span style="color: #22d3ee; font-weight: 600;">• Downloading...</span>`;
                
                await updateInfo.download((event) => {
                    if (event.event === 'Progress') {
                        // Progress callback can be used, but since we are simple we show general progress
                    }
                });
                
                updateStatus = 'installing';
                statusContainer.innerHTML = `<span style="color: #34d399; font-weight: 600;">• Installing...</span>`;
                
                await updateInfo.install();
                await relaunch();
            } catch (err) {
                console.error('[Updater] Update failed:', err);
                updateStatus = 'ready';
                statusContainer.innerHTML = `
                    <button id="install-update-btn" style="background: linear-gradient(135deg, var(--accent), #0891b2); color: white; border: none; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 600; cursor: pointer; box-shadow: 0 0 8px var(--accent-glow); font-family: inherit;">
                        Install v${updateInfo.version}
                    </button>
                `;
                document.getElementById('install-update-btn').addEventListener('click', installUpdate);
                alert('Update installation failed. Please check your network connection.');
            }
        }

        // Run checking on startup after a delay
        setTimeout(() => checkForUpdates(false), 3000);
        
        // Bind initial manual button
        if (checkBtn) {
            checkBtn.addEventListener('click', () => checkForUpdates(true));
        }
    }

    // Initialize
    loadStatus();
    connectSocket();
});
