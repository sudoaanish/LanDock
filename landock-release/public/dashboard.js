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

    // 1. Fetch IP Addresses & QR Codes
    async function loadStatus() {
        try {
            const res = await fetch('/api/status');
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
        const host = window.location.host;
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
                }
            } catch (err) {
                // Ignore standard text streams not in JSON format
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

    // Initialize
    loadStatus();
    connectSocket();
});
