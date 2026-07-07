document.addEventListener('DOMContentLoaded', () => {
    const statusIndicator = document.getElementById('status-indicator');
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

    // 1. Fetch IP Addresses & QR Codes
    async function loadStatus() {
        try {
            const host = getHost();
            const res = await fetch(`http://${host}/api/status`);
            const data = await res.json();
            
            // Render QR Cards
            if (data.ips && data.ips.length > 0) {
                connectionList.innerHTML = '';
                data.ips.forEach(item => {
                    const card = document.createElement('div');
                    card.className = 'qr-card glass-card fade-in';
                    card.innerHTML = `
                        <div style="font-weight: 600; font-size: 14px; color: var(--accent);">${item.ip}</div>
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

    // Initialize
    loadStatus();
    connectSocket();
});
