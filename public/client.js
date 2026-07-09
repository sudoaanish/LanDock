document.addEventListener('DOMContentLoaded', () => {
    // Nav Items & Panels
    const navItems = document.querySelectorAll('.nav-item');
    const viewPanels = document.querySelectorAll('.view-panel');
    const connIndicator = document.getElementById('conn-indicator');
    const connStatusText = document.getElementById('conn-status-text');
    const latencyVal = document.getElementById('latency-val');
    
    // Trackpad Views & Surface
    const tpSurface = document.getElementById('tp-surface');
    
    // Keyboard Elements
    const keyboardTrigger = document.getElementById('keyboard-trigger');
    const hiddenInput = document.getElementById('hidden-input');
    const keyButtons = document.querySelectorAll('.key-btn');
    const typingPreviewText = document.getElementById('typing-preview-text');
    const typingPreviewClear = document.getElementById('typing-preview-clear');
    const nativeKeyboardOpenClass = 'native-keyboard-open';
    
    // Clipboard Elements
    const clipArea = document.getElementById('clip-area');
    const clipStatus = document.getElementById('clip-status');
    const clipPullBtn = document.getElementById('clip-pull-btn');
    const clipPushBtn = document.getElementById('clip-push-btn');
    
    // Settings Elements
    const settingsOpen = document.getElementById('settings-open');
    const settingsClose = document.getElementById('settings-close');
    const settingsModal = document.getElementById('settings-modal');
    const toggleNaturalScroll = document.getElementById('setting-natural-scroll');
    const inputSensitivity = document.getElementById('setting-sensitivity');
    const valSensitivity = document.getElementById('sensitivity-val');
    const inputScrollSens = document.getElementById('setting-scroll-sens');
    const valScrollSens = document.getElementById('scroll-sens-val');

    // State Variables
    let socket;
    let isConnected = false;
    let latencyInterval;
    let pingTime = 0;
    let typingPreviewBuffer = '';
    
    // Configuration Loaded from LocalStorage
    let naturalScroll = localStorage.getItem('naturalScroll') !== 'false';
    let sensitivity = parseFloat(localStorage.getItem('sensitivity')) || 1.2;
    let scrollSensitivity = parseFloat(localStorage.getItem('scrollSensitivity')) || 1.0;
    
    toggleNaturalScroll.checked = naturalScroll;
    inputSensitivity.value = sensitivity;
    valSensitivity.textContent = `${sensitivity.toFixed(1)}x`;
    inputScrollSens.value = scrollSensitivity;
    valScrollSens.textContent = `${scrollSensitivity.toFixed(1)}x`;

    // Tab Switcher Logic
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const target = item.getAttribute('data-target');
            
            navItems.forEach(nav => nav.classList.remove('active'));
            viewPanels.forEach(panel => panel.classList.remove('active'));
            
            item.classList.add('active');
            document.getElementById(target).classList.add('active');
            
            // Remove notification dot on selection
            const dot = item.querySelector('.notif-dot');
            if (dot) dot.remove();

            // Hide keyboard if switching away from keyboard tab
            if (target !== 'view-keyboard') {
                hiddenInput.blur();
            }
        });
    });

    // Prevent default bounce scrolls in mobile Safari
    document.addEventListener('touchmove', (e) => {
        // Allow scrolling inside textarea of clipboard
        if (e.target.id === 'clip-area') return;
        e.preventDefault();
    }, { passive: false });

    // ==========================================
    // 1. SOCKET CONNECTION MANAGEMENT
    // ==========================================
    function connectSocket() {
        connIndicator.className = 'glow-indicator disconnected';
        connStatusText.textContent = 'Connecting...';
        connStatusText.style.color = 'var(--text-muted)';

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        socket = new WebSocket(`${protocol}//${host}`);

        socket.onopen = () => {
            isConnected = true;
            connIndicator.className = 'glow-indicator';
            connStatusText.textContent = 'Connected';
            connStatusText.style.color = 'var(--text-main)';
            
            // Start Ping interval for latency check
            startPinger();
        };

        socket.onmessage = (event) => {
            try {
                const msg = JSON.parse(event.data);
                
                if (msg.type === 'pong') {
                    const rtt = Date.now() - msg.time;
                    latencyVal.textContent = `${rtt} ms`;
                } else if (msg.type === 'clipboard_sync') {
                    clipArea.value = msg.text;
                    showClipStatus('PC Clipboard Synced');
                } else if (msg.type === 'file_available') {
                    handleSharedFileAvailable(msg.name, msg.size, msg.url);
                    notifyFileTab();
                }
            } catch (err) {
                // Ignore text commands echoed back or unhandled types
            }
        };

        socket.onclose = () => {
            isConnected = false;
            connIndicator.className = 'glow-indicator disconnected';
            connStatusText.textContent = 'Reconnecting...';
            connStatusText.style.color = 'var(--text-muted)';
            latencyVal.textContent = '-- ms';
            stopPinger();
            
            // Reconnect
            setTimeout(connectSocket, 2000);
        };
    }

    function startPinger() {
        latencyInterval = setInterval(() => {
            if (isConnected && socket.readyState === 1) {
                socket.send(JSON.stringify({ type: 'ping', time: Date.now() }));
            }
        }, 3000);
    }

    function stopPinger() {
        clearInterval(latencyInterval);
    }

    // Recover connections quickly when iOS resumes Safari tab from background
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
            if (!isConnected || socket.readyState !== 1) {
                connectSocket();
            }
        }
    });

    // ==========================================
    // 2. TOUCH GESTURES ENGINE (Precision Trackpad)
    // ==========================================
    const TOUCH_MOVE_THRESHOLD = [8, 12, 12]; // px deltas to confirm motion
    const TOUCH_TIMEOUT = 220; // ms for tap detection
    const UPDATE_RATE = 60; // Hz rate limiting

    const POINTER_ACCELERATION = [
        [0, 0.4],
        [40, 0.8],
        [150, 1.3],
        [400, 2.2],
        [1000, 3.5]
    ];

    let ongoingTouches = [];
    let touchStartTime = 0;
    let releasedCount = 0;
    let hasMoved = false;
    
    // Left-click Drag state
    let isDragging = false;
    let draggingTimeout = null;

    // Motion accumulator for rate limiting
    let moveXSum = 0;
    let moveYSum = 0;
    let scrollHSum = 0;
    let scrollVSum = 0;
    let isScrolling = false;
    let scrollFinish = false;
    let updateActive = false;

    function getAcceleration(speed) {
        for (let i = 0; i < POINTER_ACCELERATION.length; i++) {
            const s2 = POINTER_ACCELERATION[i][0];
            const a2 = POINTER_ACCELERATION[i][1];
            if (s2 <= speed) continue;
            if (i === 0) return a2;
            const s1 = POINTER_ACCELERATION[i - 1][0];
            const a1 = POINTER_ACCELERATION[i - 1][1];
            return ((speed - s1) / (s2 - s1)) * (a2 - a1) + a1;
        }
        return POINTER_ACCELERATION[POINTER_ACCELERATION.length - 1][1];
    }

    const copyTouch = (touch, timeStamp) => ({
        id: touch.identifier,
        x: touch.pageX,
        xStart: touch.pageX,
        y: touch.pageY,
        yStart: touch.pageY,
        time: timeStamp
    });

    function getTouchIndex(id) {
        for (let i = 0; i < ongoingTouches.length; i++) {
            if (ongoingTouches[i].id === id) return i;
        }
        return -1;
    }

    // Rate limited websocket stream sender
    function flushInputBuffer() {
        if (!isConnected || socket.readyState !== 1) return;
        
        let shouldContinue = false;

        // 1. Mouse movements
        const xInt = Math.trunc(moveXSum);
        const yInt = Math.trunc(moveYSum);
        if (xInt !== 0 || yInt !== 0) {
            socket.send(`m${xInt};${yInt}`);
            moveXSum -= xInt;
            moveYSum -= yInt;
            shouldContinue = true;
        }

        // 2. Scrolling
        const hInt = Math.trunc(scrollHSum);
        const vInt = Math.trunc(scrollVSum);
        if (hInt !== 0 || vInt !== 0) {
            socket.send((scrollFinish ? 'S' : 's') + `${hInt};${vInt}`);
            scrollHSum -= hInt;
            scrollVSum -= vInt;
            isScrolling = !scrollFinish;
            scrollFinish = false;
            shouldContinue = true;
        } else if (scrollFinish && isScrolling) {
            socket.send('S');
            isScrolling = false;
            scrollFinish = false;
        }

        // Keep updating at 60Hz if movements are queued
        if (shouldContinue) {
            setTimeout(flushInputBuffer, 1000 / UPDATE_RATE);
            updateActive = true;
        } else {
            updateActive = false;
        }
    }

    function queueInput() {
        if (!updateActive) {
            flushInputBuffer();
        }
    }

    function sendImmediateClick(button, press) {
        if (isConnected && socket.readyState === 1) {
            socket.send(`b${button};${press ? 1 : 0}`);
        }
    }

    // Touch Event Handlers
    tpSurface.addEventListener('touchstart', (e) => {
        e.preventDefault();
        tpSurface.classList.add('touched');

        if (ongoingTouches.length === 0) {
            touchStartTime = e.timeStamp;
            hasMoved = false;
        }

        const changed = e.changedTouches;
        for (let i = 0; i < changed.length; i++) {
            const touch = copyTouch(changed[i], e.timeStamp);
            if (getTouchIndex(touch.id) < 0) {
                ongoingTouches.push(touch);
            }
        }

        if (draggingTimeout !== null) {
            // Cancel left mouse release to preserve drag-and-drop
            clearTimeout(draggingTimeout);
            draggingTimeout = null;
            isDragging = true;
        }
    });

    tpSurface.addEventListener('touchmove', (e) => {
        e.preventDefault();
        
        const changed = e.changedTouches;
        let deltaXTotal = 0;
        let deltaYTotal = 0;

        for (let i = 0; i < changed.length; i++) {
            const idx = getTouchIndex(changed[i].identifier);
            if (idx < 0) continue;

            const oldTouch = ongoingTouches[idx];
            const currentX = changed[i].pageX;
            const currentY = changed[i].pageY;
            
            // Check if threshold of motion is crossed
            if (!hasMoved) {
                const dist = Math.sqrt(Math.pow(currentX - oldTouch.xStart, 2) + Math.pow(currentY - oldTouch.yStart, 2));
                const threshold = TOUCH_MOVE_THRESHOLD[ongoingTouches.length - 1] || 12;
                if (dist > threshold || (e.timeStamp - touchStartTime) >= TOUCH_TIMEOUT) {
                    hasMoved = true;
                }
            }

            const dx = currentX - oldTouch.x;
            const dy = currentY - oldTouch.y;
            const dt = e.timeStamp - oldTouch.time || 1;
            
            // Compute velocity in px/sec
            const speed = (Math.sqrt(dx*dx + dy*dy) / dt) * 1000;
            const mult = getAcceleration(speed);

            deltaXTotal += dx * mult;
            deltaYTotal += dy * mult;

            // Save state
            ongoingTouches[idx].x = currentX;
            ongoingTouches[idx].y = currentY;
            ongoingTouches[idx].time = e.timeStamp;
        }

        if (!hasMoved) return;

        if (ongoingTouches.length === 1 || isDragging) {
            // 1-finger Move Cursor
            moveXSum += deltaXTotal * sensitivity;
            moveYSum += deltaYTotal * sensitivity;
            queueInput();
        } else if (ongoingTouches.length === 2) {
            // 2-finger scroll
            const scrollDir = naturalScroll ? -1 : 1;
            // Scroll directions: inverted Y based on natural scrolling
            scrollHSum += -deltaXTotal * scrollSensitivity * 0.15;
            scrollVSum += deltaYTotal * scrollSensitivity * 0.15 * scrollDir;
            queueInput();
        }
    });

    function handleTouchEnd(e) {
        e.preventDefault();
        
        const changed = e.changedTouches;
        for (let i = 0; i < changed.length; i++) {
            const idx = getTouchIndex(changed[i].identifier);
            if (idx >= 0) {
                ongoingTouches.splice(idx, 1);
                releasedCount += 1;
            }
        }

        if (ongoingTouches.length === 0) {
            tpSurface.classList.remove('touched');
            
            if (isDragging) {
                // Release left click drag
                isDragging = false;
                sendImmediateClick(0, false);
            }

            // Click Recognition (Short duration, small displacement)
            const elapsed = e.timeStamp - touchStartTime;
            if (!hasMoved && elapsed < TOUCH_TIMEOUT && releasedCount > 0) {
                let button = -1;
                
                if (releasedCount === 1) {
                    button = 0; // Left click
                } else if (releasedCount === 2) {
                    button = 1; // Right click
                } else if (releasedCount === 3) {
                    button = 2; // Middle click
                }

                if (button !== -1) {
                    sendImmediateClick(button, true);
                    
                    if (button === 0) {
                        // Double tap detection: hold left down to trigger drag
                        draggingTimeout = setTimeout(() => {
                            sendImmediateClick(0, false);
                            draggingTimeout = null;
                        }, TOUCH_TIMEOUT);
                    } else {
                        // Immediate release for non-left clicks
                        sendImmediateClick(button, false);
                    }
                }
            }

            // Reset state
            releasedCount = 0;
            scrollFinish = true;
            queueInput();
        }
    }

    tpSurface.addEventListener('touchend', handleTouchEnd);
    tpSurface.addEventListener('touchcancel', handleTouchEnd);

    // ==========================================
    // 3. VIRTUAL KEYBOARD SYNC LOGIC
    // ==========================================
    function setNativeKeyboardOpen(isOpen) {
        document.body.classList.toggle(nativeKeyboardOpenClass, isOpen);
    }

    function updateNativeKeyboardState() {
        if (document.activeElement !== hiddenInput) {
            setNativeKeyboardOpen(false);
            return;
        }

        if (!window.visualViewport) {
            setNativeKeyboardOpen(true);
            return;
        }

        const viewportLoss = window.innerHeight - window.visualViewport.height;
        const keyboardThreshold = Math.max(120, window.innerHeight * 0.18);
        setNativeKeyboardOpen(viewportLoss > keyboardThreshold);
    }

    keyboardTrigger.addEventListener('click', () => {
        try {
            hiddenInput.focus({ preventScroll: true });
        } catch (err) {
            hiddenInput.focus();
        }
        requestAnimationFrame(updateNativeKeyboardState);
        setTimeout(updateNativeKeyboardState, 250);
    });

    hiddenInput.addEventListener('focus', () => {
        requestAnimationFrame(updateNativeKeyboardState);
        setTimeout(updateNativeKeyboardState, 250);
    });

    hiddenInput.addEventListener('blur', () => {
        setNativeKeyboardOpen(false);
    });

    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', updateNativeKeyboardState);
        window.visualViewport.addEventListener('scroll', updateNativeKeyboardState);
    }

    function renderTypingPreview() {
        if (!typingPreviewText) return;

        if (typingPreviewBuffer.length === 0) {
            typingPreviewText.textContent = 'Typed text will appear here.';
            typingPreviewText.classList.add('empty');
            return;
        }

        typingPreviewText.textContent = typingPreviewBuffer;
        typingPreviewText.classList.remove('empty');
        typingPreviewText.scrollTop = typingPreviewText.scrollHeight;
    }

    function appendTypingPreview(text) {
        typingPreviewBuffer += text;
        renderTypingPreview();
    }

    function backspaceTypingPreview() {
        typingPreviewBuffer = typingPreviewBuffer.slice(0, -1);
        renderTypingPreview();
    }

    if (typingPreviewClear) {
        typingPreviewClear.addEventListener('click', () => {
            typingPreviewBuffer = '';
            renderTypingPreview();
            try {
                hiddenInput.focus({ preventScroll: true });
            } catch (err) {
                hiddenInput.focus();
            }
        });
    }

    // Intercept hardware and virtual keyboard inputs on textareas
    hiddenInput.addEventListener('input', (e) => {
        const text = e.target.value;
        if (text.length > 0) {
            appendTypingPreview(text);
            if (isConnected && socket.readyState === 1) {
                socket.send(`t${text}`);
            }
            e.target.value = ''; // Reset buffer immediately
        }
    });

    // Capture special keys (Backspace, Enter, Space) via standard keydowns
    hiddenInput.addEventListener('keydown', (e) => {
        let keyIdx = -1;
        if (e.key === 'Backspace') {
            keyIdx = 15;
            backspaceTypingPreview();
        } else if (e.key === 'Enter') {
            keyIdx = 17;
            appendTypingPreview('\n');
        } else if (e.key === ' ') {
            keyIdx = 19;
            appendTypingPreview(' ');
        }
        
        if (keyIdx !== -1) {
            e.preventDefault();
            if (isConnected && socket.readyState === 1) {
                socket.send(`k${keyIdx}`);
            }
        }
    });

    // Handle manual key matrix buttons
    keyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const keyIdx = btn.getAttribute('data-key-idx');
            if (keyIdx !== null && isConnected && socket.readyState === 1) {
                socket.send(`k${keyIdx}`);
                
                // Visual feedback trigger
                btn.style.transform = 'scale(0.93)';
                setTimeout(() => btn.style.transform = '', 100);
            }
        });
    });

    // ==========================================
    // 4. CLIPBOARD PUSH / PULL LOGIC
    // ==========================================
    clipPushBtn.addEventListener('click', () => {
        const text = clipArea.value;
        if (isConnected && socket.readyState === 1) {
            socket.send(JSON.stringify({
                type: 'clipboard_push',
                text: text
            }));
            showClipStatus('Pasted to PC');
        } else {
            showClipStatus('Disconnected', true);
        }
    });

    clipPullBtn.addEventListener('click', () => {
        // Request sync (Server automatically pushes on socket message if needed,
        // or we just query since websocket connection does it. For pull we can send a request).
        // Let's send a ping/pull command
        if (isConnected && socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'ping', time: Date.now() }));
            showClipStatus('Copied from PC');
        } else {
            showClipStatus('Disconnected', true);
        }
    });

    function showClipStatus(msg, isError = false) {
        clipStatus.textContent = msg;
        clipStatus.style.color = isError ? '#ef4444' : 'var(--accent)';
        
        setTimeout(() => {
            clipStatus.textContent = 'Ready';
            clipStatus.style.color = '';
        }, 2000);
    }

    // ==========================================
    // 5. SETTINGS OVERLAY CONTROLS
    // ==========================================
    settingsOpen.addEventListener('click', () => {
        settingsModal.classList.add('active');
    });

    settingsClose.addEventListener('click', () => {
        settingsModal.classList.remove('active');
    });

    settingsModal.addEventListener('click', (e) => {
        if (e.target === settingsModal) {
            settingsModal.classList.remove('active');
        }
    });

    toggleNaturalScroll.addEventListener('change', (e) => {
        naturalScroll = e.target.checked;
        localStorage.setItem('naturalScroll', naturalScroll);
    });

    inputSensitivity.addEventListener('input', (e) => {
        sensitivity = parseFloat(e.target.value);
        valSensitivity.textContent = `${sensitivity.toFixed(1)}x`;
        localStorage.setItem('sensitivity', sensitivity);
    });

    inputScrollSens.addEventListener('input', (e) => {
        scrollSensitivity = parseFloat(e.target.value);
        valScrollSens.textContent = `${scrollSensitivity.toFixed(1)}x`;
        localStorage.setItem('scrollSensitivity', scrollSensitivity);
    });

    // ==========================================
    // 6. IMAGE & FILE SHARING LOGIC
    // ==========================================
    const fileDropzone = document.getElementById('file-dropzone');
    const mobileFileInput = document.getElementById('mobile-file-input');
    const uploadStatusCard = document.getElementById('upload-status-card');
    const uploadFilename = document.getElementById('upload-filename');
    const uploadProgressPercent = document.getElementById('upload-progress-percent');
    const uploadCancelBtn = document.getElementById('upload-cancel-btn');
    const mobileReceivedFiles = document.getElementById('mobile-received-files');

    let activeUploadXhr = null;

    if (fileDropzone) {
        fileDropzone.addEventListener('click', () => {
            mobileFileInput.click();
        });
    }

    if (mobileFileInput) {
        mobileFileInput.addEventListener('change', (e) => {
            const files = e.target.files;
            if (files.length > 0) {
                uploadFile(files[0]);
            }
        });
    }

    function uploadFile(file) {
        const formData = new FormData();
        formData.append('file', file);

        activeUploadXhr = new XMLHttpRequest();
        
        // Show progress UI
        uploadFilename.textContent = file.name;
        uploadProgressPercent.textContent = '0%';
        uploadStatusCard.style.display = 'flex';

        activeUploadXhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                uploadProgressPercent.textContent = `${percent}%`;
            }
        };

        activeUploadXhr.onload = () => {
            uploadStatusCard.style.display = 'none';
            if (activeUploadXhr && activeUploadXhr.status === 200) {
                mobileFileInput.value = '';
            }
            activeUploadXhr = null;
        };

        activeUploadXhr.onerror = () => {
            uploadProgressPercent.textContent = 'Failed';
            uploadProgressPercent.style.color = '#ef4444';
            activeUploadXhr = null;
            setTimeout(() => {
                uploadStatusCard.style.display = 'none';
                uploadProgressPercent.style.color = '';
            }, 2000);
        };

        activeUploadXhr.onabort = () => {
            uploadStatusCard.style.display = 'none';
            activeUploadXhr = null;
        };

        activeUploadXhr.open('POST', `/api/upload`, true);
        activeUploadXhr.send(formData);
    }

    if (uploadCancelBtn) {
        uploadCancelBtn.addEventListener('click', () => {
            if (activeUploadXhr) {
                activeUploadXhr.abort();
            }
        });
    }

    function notifyFileTab() {
        const filesTab = document.querySelector('.nav-item[data-target="view-files"]');
        const activeTab = document.querySelector('.nav-item.active');
        if (filesTab && activeTab && activeTab.getAttribute('data-target') !== 'view-files') {
            let dot = filesTab.querySelector('.notif-dot');
            if (!dot) {
                dot = document.createElement('span');
                dot.className = 'notif-dot';
                dot.style.position = 'absolute';
                dot.style.top = '10px';
                dot.style.right = '25%';
                dot.style.width = '8px';
                dot.style.height = '8px';
                dot.style.borderRadius = '50%';
                dot.style.background = '#ef4444';
                filesTab.style.position = 'relative';
                filesTab.appendChild(dot);
            }
        }
    }

    function handleSharedFileAvailable(name, size, url) {
        if (!mobileReceivedFiles) return;
        
        // Clear empty state
        if (mobileReceivedFiles.querySelector('div') && mobileReceivedFiles.querySelector('div').textContent.includes('No files shared')) {
            mobileReceivedFiles.innerHTML = '';
        }

        const sizeStr = formatBytes(size);
        const fileCard = document.createElement('div');
        fileCard.className = 'glass-card fade-in';
        fileCard.style.display = 'flex';
        fileCard.style.flexDirection = 'column';
        fileCard.style.padding = '12px';
        fileCard.style.margin = '4px 0';
        fileCard.style.border = '1px solid rgba(255,255,255,0.04)';
        fileCard.style.background = 'rgba(255,255,255,0.01)';
        
        const host = window.location.host;
        const fullUrl = `http://${host}${url}`;

        const isImage = /\.(jpg|jpeg|png|gif|webp|heic)$/i.test(name);
        let previewHtml = '';
        if (isImage) {
            previewHtml = `
                <div style="margin-top: 10px; text-align: center; width: 100%;">
                    <img src="${fullUrl}" alt="${name}" style="max-width: 100%; max-height: 160px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.08); object-fit: contain;">
                    <div style="font-size: 11px; color: var(--text-muted); margin-top: 6px;">Long-press image to Save to Photos</div>
                </div>
            `;
        }

        fileCard.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; width: 100%;">
                <div style="display: flex; align-items: center; gap: 8px; width: 65%;">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color: var(--accent); flex-shrink: 0;"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>
                    <div style="font-size: 13px; font-weight: 500; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--text-main);">${name}</div>
                </div>
                <a href="${fullUrl}" target="_blank" download="${name}" style="background: linear-gradient(135deg, var(--accent), #0891b2); color: white; text-decoration: none; padding: 6px 12px; border-radius: 6px; font-size: 11px; font-weight: 600; box-shadow: 0 2px 8px var(--accent-glow); display: inline-block;">Get (${sizeStr})</a>
            </div>
            ${previewHtml}
        `;
        mobileReceivedFiles.insertBefore(fileCard, mobileReceivedFiles.firstChild);
    }

    function formatBytes(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
    }

    // Initialize Connection on Load
    connectSocket();
});
