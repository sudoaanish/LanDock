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
    const modifierButtons = document.querySelectorAll('.modifier-key');
    const commandButtons = document.querySelectorAll('.command-btn');
    const typingPreviewText = document.getElementById('typing-preview-text');
    const typingPreviewClear = document.getElementById('typing-preview-clear');
    const nativeKeyboardOpenClass = 'native-keyboard-open';
    
    // Clipboard Elements
    const clipArea = document.getElementById('clip-area');
    const clipStatus = document.getElementById('clip-status');
    const clipPullBtn = document.getElementById('clip-pull-btn');
    const clipPushBtn = document.getElementById('clip-push-btn');

    // Screen Peek Elements
    const screenRefreshBtn = document.getElementById('screen-refresh-btn');
    const screenAutoToggle = document.getElementById('screen-auto-toggle');
    const screenStatus = document.getElementById('screen-status');
    const screenPreview = document.getElementById('screen-preview');
    const screenImage = document.getElementById('screen-image');
    const screenPlaceholder = document.getElementById('screen-placeholder');
    const screenFitBtn = document.getElementById('screen-fit-btn');
    
    // Settings Elements
    const settingsOpen = document.getElementById('settings-open');
    const settingsClose = document.getElementById('settings-close');
    const settingsModal = document.getElementById('settings-modal');
    const settingsAppVersion = document.getElementById('settings-app-version');
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
    let activeModifier = null;
    let heldModifier = null;
    let modifierPointerId = null;
    let modifierTouchId = null;
    let modifierHoldStarted = false;
    let heldModifierUsed = false;
    let modifierHoldTimer = null;
    const modifierHoldThresholdMs = 180;
    const screenAutoRefreshMs = 2000;
    let screenAutoInterval = null;
    let screenCaptureController = null;
    let screenCaptureInFlight = false;
    let screenImageUrl = null;
    let screenLastUpdatedAt = null;
    let screenStatusError = null;
    let screenScale = 1;
    let screenPanX = 0;
    let screenPanY = 0;
    let screenDragStart = null;
    let screenPinchStart = null;
    let screenGestureHadPinch = false;
    let screenLastTap = null;
    let appInfoLoaded = false;
    const screenPointers = new Map();
    const screenMinScale = 1;
    const screenMaxScale = 4;
    const comboKeyNames = {
        9: 'left',
        10: 'right',
        11: 'up',
        12: 'down',
        15: 'backspace',
        16: 'delete',
        17: 'enter'
    };
    const supportedModifierCombos = new Set([
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

            handleScreenTabChange(target);
        });
    });

    // Prevent default bounce scrolls in mobile Safari
    document.addEventListener('touchmove', (e) => {
        // Allow scrolling inside content areas designed for touch scrolling.
        if (e.target.id === 'clip-area' || e.target.closest?.('.files-scroll')) return;
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
            syncScreenAutoRefresh();
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
            stopScreenAutoRefresh(true);
            
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
            syncScreenAutoRefresh();
        } else {
            stopScreenAutoRefresh(true);
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

    function renderModifierState() {
        modifierButtons.forEach(btn => {
            const modifier = btn.getAttribute('data-modifier');
            btn.classList.toggle('active', modifier === heldModifier || modifier === activeModifier);
        });
    }

    function clearActiveModifier() {
        activeModifier = null;
        renderModifierState();
    }

    function clearHeldModifier() {
        heldModifier = null;
        modifierPointerId = null;
        modifierTouchId = null;
        modifierHoldStarted = false;
        heldModifierUsed = false;
        if (modifierHoldTimer) {
            clearTimeout(modifierHoldTimer);
            modifierHoldTimer = null;
        }
        renderModifierState();
    }

    function beginModifierHold(modifier) {
        if (!modifier) return;

        if (modifierHoldTimer) {
            clearTimeout(modifierHoldTimer);
        }

        modifierHoldStarted = false;
        heldModifierUsed = false;
        heldModifier = modifier;
        renderModifierState();

        modifierHoldTimer = setTimeout(() => {
            modifierHoldStarted = true;
            renderModifierState();
        }, modifierHoldThresholdMs);
    }

    function endModifierHold(modifier) {
        const shouldToggle = !modifierHoldStarted && !heldModifierUsed;
        clearHeldModifier();

        if (shouldToggle && modifier) {
            activeModifier = activeModifier === modifier ? null : modifier;
            renderModifierState();
        }
    }

    function findChangedTouch(touchList, identifier) {
        for (let i = 0; i < touchList.length; i++) {
            if (touchList[i].identifier === identifier) {
                return touchList[i];
            }
        }
        return null;
    }

    function sendKeyCombo(modifier, keyName) {
        if (!modifier || !keyName || !supportedModifierCombos.has(`${modifier}:${keyName}`)) {
            return false;
        }

        if (isConnected && socket.readyState === 1) {
            socket.send(JSON.stringify({
                type: 'key_combo',
                modifiers: [modifier],
                key: keyName
            }));
        }
        return true;
    }

    modifierButtons.forEach(btn => {
        btn.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            const modifier = btn.getAttribute('data-modifier');
            if (!modifier) return;

            modifierPointerId = e.pointerId;
            beginModifierHold(modifier);
        });

        btn.addEventListener('pointerup', (e) => {
            if (e.pointerType === 'touch') return;
            e.preventDefault();
            const modifier = btn.getAttribute('data-modifier');
            if (modifierPointerId === e.pointerId) {
                endModifierHold(modifier);
            }
        });

        btn.addEventListener('pointercancel', (e) => {
            if (e.pointerType !== 'touch' && modifierPointerId === e.pointerId) {
                clearHeldModifier();
            }
        });

        btn.addEventListener('touchstart', (e) => {
            if (modifierTouchId !== null || e.changedTouches.length === 0) return;

            e.preventDefault();
            const modifier = btn.getAttribute('data-modifier');
            if (!modifier) return;

            modifierTouchId = e.changedTouches[0].identifier;
            beginModifierHold(modifier);
        }, { passive: false });

        btn.addEventListener('touchend', (e) => {
            if (modifierTouchId === null || !findChangedTouch(e.changedTouches, modifierTouchId)) {
                return;
            }

            e.preventDefault();
            const modifier = btn.getAttribute('data-modifier');
            endModifierHold(modifier);
        }, { passive: false });

        btn.addEventListener('touchcancel', (e) => {
            if (modifierTouchId !== null && findChangedTouch(e.changedTouches, modifierTouchId)) {
                clearHeldModifier();
            }
        });

        btn.addEventListener('contextmenu', (e) => {
            e.preventDefault();
        });

        btn.addEventListener('click', (e) => {
            e.preventDefault();
        });
    });

    window.addEventListener('blur', () => {
        if (heldModifier) {
            clearHeldModifier();
        }
    });

    function getActiveModifierForKey() {
        return heldModifier || activeModifier;
    }

    function clearModifierAfterCombo(modifier) {
        if (modifier === heldModifier) {
            heldModifierUsed = true;
            renderModifierState();
        } else if (modifier === activeModifier) {
            clearActiveModifier();
        } else {
            renderModifierState();
        }
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

    function activateUtilityKey(btn) {
        const keyIdx = btn.getAttribute('data-key-idx');
        if (keyIdx !== null && isConnected && socket.readyState === 1) {
            const keyName = comboKeyNames[keyIdx];
            const modifier = getActiveModifierForKey();
            const sentCombo = modifier ? sendKeyCombo(modifier, keyName) : false;

            if (sentCombo) {
                clearModifierAfterCombo(modifier);
            } else {
                socket.send(`k${keyIdx}`);
                if (modifier === activeModifier && !heldModifier) {
                    clearActiveModifier();
                }
            }

            // Visual feedback trigger
            btn.style.transform = 'scale(0.93)';
            setTimeout(() => btn.style.transform = '', 100);
        }
    }

    // Handle manual key matrix buttons
    keyButtons.forEach(btn => {
        btn.addEventListener('touchend', (e) => {
            const keyIdx = btn.getAttribute('data-key-idx');
            if (keyIdx === null) return;

            e.preventDefault();
            btn.dataset.touchHandled = '1';
            activateUtilityKey(btn);
            setTimeout(() => {
                delete btn.dataset.touchHandled;
            }, 450);
        }, { passive: false });

        btn.addEventListener('click', (e) => {
            if (btn.dataset.touchHandled === '1') {
                e.preventDefault();
                return;
            }

            activateUtilityKey(btn);
        });
    });

    function activateCommand(btn) {
        const command = btn.getAttribute('data-command');
        if (!command || !isConnected || socket.readyState !== 1) return;

        socket.send(JSON.stringify({ type: 'command', command }));
        btn.style.transform = 'scale(0.94)';
        setTimeout(() => btn.style.transform = '', 100);
    }

    commandButtons.forEach(btn => {
        btn.addEventListener('touchend', (e) => {
            e.preventDefault();
            btn.dataset.touchHandled = '1';
            activateCommand(btn);
            setTimeout(() => {
                delete btn.dataset.touchHandled;
            }, 450);
        }, { passive: false });

        btn.addEventListener('click', (e) => {
            if (btn.dataset.touchHandled === '1') {
                e.preventDefault();
                return;
            }

            activateCommand(btn);
        });
    });

    function isScreenTabActive() {
        const activeTab = document.querySelector('.nav-item.active');
        return activeTab && activeTab.getAttribute('data-target') === 'view-screen';
    }

    function setScreenStatus(message, isError = false) {
        if (!screenStatus) return;
        screenStatus.textContent = message;
        screenStatus.classList.toggle('error', isError);
    }

    function renderScreenAge() {
        if (!screenLastUpdatedAt || screenCaptureInFlight || screenStatusError) return;

        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - screenLastUpdatedAt) / 1000));
        setScreenStatus(elapsedSeconds < 2 ? 'Updated just now' : `Updated ${elapsedSeconds}s ago`);
    }

    function clampScreenScale(scale) {
        return Math.min(screenMaxScale, Math.max(screenMinScale, scale));
    }

    function getContainedScreenSize() {
        const width = screenPreview.clientWidth;
        const height = screenPreview.clientHeight;
        if (!screenImage.naturalWidth || !screenImage.naturalHeight || width === 0 || height === 0) {
            return { width, height };
        }

        const imageRatio = screenImage.naturalWidth / screenImage.naturalHeight;
        const containerRatio = width / height;
        if (imageRatio > containerRatio) {
            return { width, height: width / imageRatio };
        }
        return { width: height * imageRatio, height };
    }

    function clampScreenPan() {
        if (screenScale <= screenMinScale) {
            screenPanX = 0;
            screenPanY = 0;
            return;
        }

        const containerWidth = screenPreview.clientWidth;
        const containerHeight = screenPreview.clientHeight;
        const contained = getContainedScreenSize();
        const maxPanX = Math.max(0, (contained.width * screenScale - containerWidth) / 2);
        const maxPanY = Math.max(0, (contained.height * screenScale - containerHeight) / 2);
        screenPanX = Math.min(maxPanX, Math.max(-maxPanX, screenPanX));
        screenPanY = Math.min(maxPanY, Math.max(-maxPanY, screenPanY));
    }

    function applyScreenTransform() {
        clampScreenPan();
        screenImage.style.transform = `translate3d(${screenPanX}px, ${screenPanY}px, 0) scale(${screenScale})`;
        screenPreview.classList.toggle('zoomed', screenScale > screenMinScale);
        screenFitBtn.disabled = screenScale <= screenMinScale;
    }

    function resetScreenView() {
        screenScale = screenMinScale;
        screenPanX = 0;
        screenPanY = 0;
        applyScreenTransform();
    }

    function zoomScreenAt(nextScale, clientX, clientY) {
        const clampedScale = clampScreenScale(nextScale);
        if (Math.abs(clampedScale - screenScale) < 0.001) return;

        const rect = screenPreview.getBoundingClientRect();
        const offsetX = clientX - (rect.left + rect.width / 2);
        const offsetY = clientY - (rect.top + rect.height / 2);
        const ratio = clampedScale / screenScale;
        screenPanX = offsetX - (offsetX - screenPanX) * ratio;
        screenPanY = offsetY - (offsetY - screenPanY) * ratio;
        screenScale = clampedScale;
        applyScreenTransform();
    }

    function toggleScreenZoom(clientX, clientY) {
        if (screenScale > screenMinScale + 0.01) {
            resetScreenView();
        } else {
            zoomScreenAt(2, clientX, clientY);
        }
    }

    function getScreenPointerPair() {
        return Array.from(screenPointers.values()).slice(0, 2);
    }

    function beginScreenPinch() {
        const pair = getScreenPointerPair();
        if (pair.length < 2) return;

        const [first, second] = pair;
        screenGestureHadPinch = true;
        screenPinchStart = {
            distance: Math.hypot(second.x - first.x, second.y - first.y),
            midpointX: (first.x + second.x) / 2,
            midpointY: (first.y + second.y) / 2,
            scale: screenScale,
            panX: screenPanX,
            panY: screenPanY
        };
    }

    function resetScreenDragAnchor() {
        const remaining = screenPointers.values().next().value;
        screenDragStart = remaining ? {
            x: remaining.x,
            y: remaining.y,
            panX: screenPanX,
            panY: screenPanY
        } : null;
    }

    function handleScreenPointerDown(e) {
        if (screenImage.hidden || (e.pointerType === 'mouse' && e.button !== 0)) return;

        e.preventDefault();
        screenPointers.set(e.pointerId, {
            x: e.clientX,
            y: e.clientY,
            startX: e.clientX,
            startY: e.clientY,
            startedAt: Date.now(),
            pointerType: e.pointerType
        });
        try {
            screenPreview.setPointerCapture(e.pointerId);
        } catch (err) {
            // Continue without capture on browsers that do not support it.
        }

        if (screenPointers.size === 1) {
            resetScreenDragAnchor();
            screenPreview.classList.add('is-panning');
        } else if (screenPointers.size === 2) {
            beginScreenPinch();
        }
    }

    function handleScreenPointerMove(e) {
        const pointer = screenPointers.get(e.pointerId);
        if (!pointer) return;

        e.preventDefault();
        pointer.x = e.clientX;
        pointer.y = e.clientY;

        if (screenPointers.size >= 2 && screenPinchStart) {
            const [first, second] = getScreenPointerPair();
            const distance = Math.hypot(second.x - first.x, second.y - first.y);
            const midpointX = (first.x + second.x) / 2;
            const midpointY = (first.y + second.y) / 2;
            const nextScale = clampScreenScale(screenPinchStart.scale * distance / Math.max(1, screenPinchStart.distance));
            const rect = screenPreview.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;
            const ratio = nextScale / screenPinchStart.scale;
            screenPanX = midpointX - centerX - (screenPinchStart.midpointX - centerX - screenPinchStart.panX) * ratio;
            screenPanY = midpointY - centerY - (screenPinchStart.midpointY - centerY - screenPinchStart.panY) * ratio;
            screenScale = nextScale;
            applyScreenTransform();
        } else if (screenPointers.size === 1 && screenScale > screenMinScale && screenDragStart) {
            screenPanX = screenDragStart.panX + (pointer.x - screenDragStart.x);
            screenPanY = screenDragStart.panY + (pointer.y - screenDragStart.y);
            applyScreenTransform();
        }
    }

    function registerScreenTap(pointer) {
        if (pointer.pointerType !== 'touch') return;

        const now = Date.now();
        if (screenLastTap && now - screenLastTap.time < 320 &&
            Math.hypot(pointer.x - screenLastTap.x, pointer.y - screenLastTap.y) < 28) {
            toggleScreenZoom(pointer.x, pointer.y);
            screenLastTap = null;
        } else {
            screenLastTap = { time: now, x: pointer.x, y: pointer.y };
        }
    }

    function finishScreenPointer(e, cancelled = false) {
        const pointer = screenPointers.get(e.pointerId);
        if (!pointer) return;

        e.preventDefault();
        const wasOnlyPointer = screenPointers.size === 1;
        const wasTap = wasOnlyPointer && !screenGestureHadPinch &&
            Date.now() - pointer.startedAt < 300 &&
            Math.hypot(pointer.x - pointer.startX, pointer.y - pointer.startY) < 12;
        screenPointers.delete(e.pointerId);
        try {
            screenPreview.releasePointerCapture(e.pointerId);
        } catch (err) {
            // Pointer capture may already have been released by the browser.
        }

        if (wasTap && !cancelled) registerScreenTap(pointer);

        if (screenPointers.size === 1) {
            screenPinchStart = null;
            resetScreenDragAnchor();
        } else if (screenPointers.size === 0) {
            screenPinchStart = null;
            screenDragStart = null;
            screenGestureHadPinch = false;
            screenPreview.classList.remove('is-panning');
        }
    }

    if (screenPreview) {
        screenPreview.addEventListener('pointerdown', handleScreenPointerDown);
        screenPreview.addEventListener('pointermove', handleScreenPointerMove);
        screenPreview.addEventListener('pointerup', e => finishScreenPointer(e));
        screenPreview.addEventListener('pointercancel', e => finishScreenPointer(e, true));
        screenPreview.addEventListener('wheel', e => {
            if (screenImage.hidden) return;
            e.preventDefault();
            zoomScreenAt(screenScale * Math.exp(-e.deltaY * 0.002), e.clientX, e.clientY);
        }, { passive: false });
        screenPreview.addEventListener('dblclick', e => {
            if (screenImage.hidden) return;
            e.preventDefault();
            toggleScreenZoom(e.clientX, e.clientY);
        });
        screenPreview.addEventListener('contextmenu', e => e.preventDefault());
    }

    if (screenFitBtn) {
        screenFitBtn.addEventListener('click', resetScreenView);
    }

    window.addEventListener('resize', applyScreenTransform);

    function stopScreenAutoRefresh(abortCapture = false) {
        if (screenAutoInterval) {
            clearInterval(screenAutoInterval);
            screenAutoInterval = null;
        }

        if (abortCapture && screenCaptureController) {
            screenCaptureController.abort();
        }
    }

    function syncScreenAutoRefresh() {
        stopScreenAutoRefresh();
        if (!screenAutoToggle || !screenAutoToggle.checked || !isScreenTabActive() || document.hidden) {
            return;
        }

        if (!isConnected) {
            setScreenStatus('Auto Refresh paused while reconnecting');
            return;
        }

        refreshScreenSnapshot();
        screenAutoInterval = setInterval(refreshScreenSnapshot, screenAutoRefreshMs);
    }

    function handleScreenTabChange(target) {
        if (target === 'view-screen') {
            syncScreenAutoRefresh();
            return;
        }

        if (screenAutoToggle) {
            screenAutoToggle.checked = false;
        }
        stopScreenAutoRefresh(true);
    }

    async function refreshScreenSnapshot() {
        if (screenCaptureInFlight || document.hidden) return;

        const controller = new AbortController();
        screenCaptureController = controller;
        screenCaptureInFlight = true;
        screenStatusError = null;
        screenRefreshBtn.disabled = true;
        setScreenStatus('Capturing...');

        let nextImageUrl = null;
        try {
            const response = await fetch(`/api/screen/snapshot?t=${Date.now()}`, {
                cache: 'no-store',
                signal: controller.signal
            });

            if (!response.ok) {
                let message = `Capture failed (${response.status})`;
                try {
                    const payload = await response.json();
                    if (payload && payload.error) message = payload.error;
                } catch (err) {
                    // Keep the HTTP status fallback when the response is not JSON.
                }
                throw new Error(message);
            }

            const blob = await response.blob();
            if (!blob.type.startsWith('image/')) {
                throw new Error('The server returned an invalid screenshot.');
            }

            nextImageUrl = URL.createObjectURL(blob);
            await new Promise((resolve, reject) => {
                const probe = new Image();
                probe.onload = resolve;
                probe.onerror = () => reject(new Error('The screenshot could not be displayed.'));
                probe.src = nextImageUrl;
            });

            const previousImageUrl = screenImageUrl;
            screenImageUrl = nextImageUrl;
            nextImageUrl = null;
            screenImage.src = screenImageUrl;
            screenImage.hidden = false;
            screenPlaceholder.hidden = true;
            resetScreenView();
            screenLastUpdatedAt = Date.now();
            if (previousImageUrl) URL.revokeObjectURL(previousImageUrl);
        } catch (err) {
            if (nextImageUrl) URL.revokeObjectURL(nextImageUrl);
            if (err.name === 'AbortError') {
                screenStatusError = null;
                if (screenLastUpdatedAt) {
                    renderScreenAge();
                } else {
                    setScreenStatus('Ready');
                }
            } else {
                screenStatusError = err.message;
                setScreenStatus(`Failed: ${err.message}`, true);
            }
        } finally {
            if (screenCaptureController === controller) {
                screenCaptureController = null;
            }
            screenCaptureInFlight = false;
            screenRefreshBtn.disabled = false;
            renderScreenAge();
        }
    }

    if (screenRefreshBtn) {
        screenRefreshBtn.addEventListener('click', refreshScreenSnapshot);
    }

    if (screenAutoToggle) {
        screenAutoToggle.addEventListener('change', () => {
            if (screenAutoToggle.checked) {
                syncScreenAutoRefresh();
            } else {
                stopScreenAutoRefresh(true);
                screenStatusError = null;
                if (screenLastUpdatedAt) {
                    renderScreenAge();
                } else {
                    setScreenStatus('Ready');
                }
            }
        });
    }

    setInterval(renderScreenAge, 1000);
    window.addEventListener('beforeunload', () => {
        stopScreenAutoRefresh(true);
        if (screenImageUrl) URL.revokeObjectURL(screenImageUrl);
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
    async function loadAppInfo() {
        if (!settingsAppVersion || appInfoLoaded) return;

        try {
            const response = await fetch('/api/app-info', { cache: 'no-store' });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const appInfo = await response.json();
            if (typeof appInfo.version !== 'string' || !appInfo.version.trim()) {
                throw new Error('Missing version');
            }
            settingsAppVersion.textContent = `LanDock v${appInfo.version}`;
            appInfoLoaded = true;
        } catch (err) {
            settingsAppVersion.textContent = 'LanDock version unavailable';
            console.warn('Unable to load LanDock app info:', err.message);
        }
    }

    settingsOpen.addEventListener('click', () => {
        settingsModal.classList.add('active');
        loadAppInfo();
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

    loadAppInfo();

    // ==========================================
    // 6. IMAGE & FILE SHARING LOGIC
    // ==========================================
    const fileDropzone = document.getElementById('file-dropzone');
    const mobileFileInput = document.getElementById('mobile-file-input');
    const uploadStatusCard = document.getElementById('upload-status-card');
    const uploadFilename = document.getElementById('upload-filename');
    const uploadProgressPercent = document.getElementById('upload-progress-percent');
    const uploadCancelBtn = document.getElementById('upload-cancel-btn');
    const mobileSentFiles = document.getElementById('mobile-sent-files');
    const mobileReceivedFiles = document.getElementById('mobile-received-files');

    const sentFilesStorageKey = 'landockSentFilesV1';
    const maxSentFiles = 20;
    let sentFiles = loadSentFiles();
    let activeUploadXhr = null;

    function loadSentFiles() {
        try {
            const stored = JSON.parse(localStorage.getItem(sentFilesStorageKey) || '[]');
            if (!Array.isArray(stored)) return [];
            return stored
                .filter(item => item && typeof item.name === 'string' && Number.isFinite(item.size))
                .slice(0, maxSentFiles)
                .map(item => ({
                    id: String(item.id || `${item.timestamp}-${item.name}`),
                    name: item.name,
                    size: item.size,
                    status: item.status === 'sent' ? 'sent' : 'failed',
                    progress: item.status === 'sent' ? 100 : 0,
                    timestamp: Number.isFinite(item.timestamp) ? item.timestamp : Date.now()
                }));
        } catch (err) {
            console.warn('Unable to restore sent file history:', err.message);
            return [];
        }
    }

    function persistSentFiles() {
        try {
            localStorage.setItem(sentFilesStorageKey, JSON.stringify(sentFiles.slice(0, maxSentFiles)));
        } catch (err) {
            console.warn('Unable to save sent file history:', err.message);
        }
    }

    function formatRelativeTime(timestamp) {
        const elapsedSeconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
        if (elapsedSeconds < 60) return 'just now';
        if (elapsedSeconds < 3600) return `${Math.floor(elapsedSeconds / 60)}m ago`;
        return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }

    function renderSentFiles() {
        if (!mobileSentFiles) return;
        mobileSentFiles.innerHTML = '';

        if (sentFiles.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'file-empty-state';
            empty.textContent = 'No files sent yet';
            mobileSentFiles.appendChild(empty);
            return;
        }

        sentFiles.forEach(item => {
            const row = document.createElement('div');
            row.className = 'sent-file-row';

            const copy = document.createElement('div');
            copy.className = 'sent-file-copy';

            const name = document.createElement('div');
            name.className = 'sent-file-name';
            name.textContent = item.name;

            const meta = document.createElement('div');
            meta.className = 'sent-file-meta';
            meta.textContent = `${formatBytes(item.size)} · ${formatRelativeTime(item.timestamp)}`;

            const status = document.createElement('div');
            status.className = `sent-file-status${item.status === 'failed' ? ' failed' : ''}`;
            status.textContent = item.status === 'uploading'
                ? `Uploading ${item.progress || 0}%`
                : item.status === 'sent' ? 'Sent' : 'Failed';

            copy.append(name, meta);
            row.append(copy, status);
            mobileSentFiles.appendChild(row);
        });
    }

    function addSentFile(file) {
        const item = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            name: file.name,
            size: file.size,
            status: 'uploading',
            progress: 0,
            timestamp: Date.now()
        };
        sentFiles.unshift(item);
        sentFiles = sentFiles.slice(0, maxSentFiles);
        persistSentFiles();
        renderSentFiles();
        return item.id;
    }

    function updateSentFile(id, updates, shouldPersist = true) {
        const item = sentFiles.find(entry => entry.id === id);
        if (!item) return;
        const changed = Object.entries(updates).some(([key, value]) => item[key] !== value);
        if (!changed) return;
        Object.assign(item, updates);
        if (shouldPersist) persistSentFiles();
        renderSentFiles();
    }

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
        if (activeUploadXhr) activeUploadXhr.abort();

        const formData = new FormData();
        formData.append('file', file);

        const sentFileId = addSentFile(file);
        const uploadXhr = new XMLHttpRequest();
        activeUploadXhr = uploadXhr;
        
        // Show progress UI
        uploadFilename.textContent = file.name;
        uploadProgressPercent.textContent = '0%';
        uploadProgressPercent.style.color = '';
        uploadStatusCard.dataset.uploadId = sentFileId;
        uploadStatusCard.style.display = 'flex';

        uploadXhr.upload.onprogress = (event) => {
            if (event.lengthComputable) {
                const percent = Math.round((event.loaded / event.total) * 100);
                uploadProgressPercent.textContent = `${percent}%`;
                updateSentFile(sentFileId, { progress: percent }, false);
            }
        };

        uploadXhr.onload = () => {
            if (uploadXhr.status >= 200 && uploadXhr.status < 300) {
                let savedName = file.name;
                try {
                    const response = JSON.parse(uploadXhr.responseText);
                    if (typeof response.name === 'string' && response.name) savedName = response.name;
                } catch (err) {
                    // The upload succeeded; retaining the local filename is sufficient.
                }
                updateSentFile(sentFileId, {
                    name: savedName,
                    status: 'sent',
                    progress: 100,
                    timestamp: Date.now()
                });
                mobileFileInput.value = '';
                uploadStatusCard.style.display = 'none';
            } else {
                updateSentFile(sentFileId, { status: 'failed', timestamp: Date.now() });
                uploadProgressPercent.textContent = 'Failed';
                uploadProgressPercent.style.color = '#ef4444';
                setTimeout(() => {
                    if (!activeUploadXhr && uploadStatusCard.dataset.uploadId === sentFileId) {
                        uploadStatusCard.style.display = 'none';
                        uploadProgressPercent.style.color = '';
                    }
                }, 2000);
            }
            if (activeUploadXhr === uploadXhr) activeUploadXhr = null;
        };

        uploadXhr.onerror = () => {
            updateSentFile(sentFileId, { status: 'failed', timestamp: Date.now() });
            uploadProgressPercent.textContent = 'Failed';
            uploadProgressPercent.style.color = '#ef4444';
            if (activeUploadXhr === uploadXhr) activeUploadXhr = null;
            setTimeout(() => {
                if (!activeUploadXhr && uploadStatusCard.dataset.uploadId === sentFileId) {
                    uploadStatusCard.style.display = 'none';
                    uploadProgressPercent.style.color = '';
                }
            }, 2000);
        };

        uploadXhr.onabort = () => {
            updateSentFile(sentFileId, { status: 'failed', timestamp: Date.now() });
            uploadStatusCard.style.display = 'none';
            if (activeUploadXhr === uploadXhr) activeUploadXhr = null;
        };

        uploadXhr.open('POST', '/api/upload', true);
        uploadXhr.send(formData);
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

    renderSentFiles();

    // Initialize Connection on Load
    connectSocket();
});
