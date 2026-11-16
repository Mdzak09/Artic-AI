(() => {
    'use strict';

    if (window.__zaamPolarionAI) {
        return;
    }

    if (!document.body) {
        return;
    }

    window.__zaamPolarionAI = true;

    const namespace = 'zaam-polarion-ai';
    const api = '/polarion/aiassistant/api/chat';

    let assistantButton = null;
    let assistantButtonStyle = null;
    let panelHost = null;
    let uiGeneration = 0;
    let reconcileScheduled = false;
    let headerObserver = null;
    let discoveryObserver = null;
    let observedHeaderAnchor;
    let panel;
    let log;
    let input;
    let send;
    let pending = false;
    let last = '';
    let history = [];
    let settings = {
        visible: false,
        enabled: true,
        showHeaderButton: true,
        name: '',
        theme: 'system',
        accentColor: '#1280A6',
        sidebarWidth: 420,
        headerPlacement: 'right',
        mode: 'unconfigured'
    };

    // --------------------------------------------------
    // Initialize the AI button and sidebar
    // --------------------------------------------------

    function init() {
        const branding = findSiemensBranding();
        observeHeaderAnchor(branding);
        if (!document.body || settings.visible === false
                || settings.showHeaderButton === false || !branding) {
            destroyAssistantUi();
            return;
        }

        if (!assistantButton || !panelHost) {
            createAssistantUi();
        }
        if (!assistantButton || !panelHost || !branding.parentElement) {
            destroyAssistantUi();
            return;
        }

        // Siemens branding is the stable right edge of the native header.
        // Insert directly before it, in its own live parent container.
        if (assistantButton.parentElement !== branding.parentElement
                || assistantButton.nextElementSibling !== branding) {
            branding.parentElement.insertBefore(assistantButton, branding);
        }
        document.querySelectorAll('#' + namespace + '-button').forEach((element) => {
            if (element !== assistantButton) element.remove();
        });
        if (panelHost.parentElement !== document.body) {
            document.body.append(panelHost);
        }
    }

    function createAssistantUi() {
        const button = document.createElement('button');
        button.id = namespace + '-button';
        button.type = 'button';
        button.title = 'Open ' + assistantDisplayName();
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-expanded', 'false');
        button.textContent = assistantDisplayName();
        button.style.setProperty('--assistant-accent', settings.accentColor);
        button.style.setProperty('--assistant-accent-dark', darken(settings.accentColor));
        assistantButton = button;

        const buttonStyle = document.createElement('style');
        buttonStyle.id = namespace + '-button-style';
        buttonStyle.textContent = `
            #${namespace}-button {
                height: 34px;
                margin: 0 2px;
                padding: 0 12px;
                border: 2px solid #f8fbff;
                border-radius: 5px;
                background: var(--assistant-accent);
                color: #f8fbff;
                font: 600 13px/1.4 Arial, sans-serif;
                cursor: pointer;
                transition: background-color 0.2s ease;
                vertical-align: middle;
            }
            #${namespace}-button:hover { background: var(--assistant-accent-dark); }
            #${namespace}-button:active { filter: brightness(0.9); }
            #${namespace}-button:focus-visible {
                outline: 2px solid var(--assistant-accent);
                outline-offset: 2px;
            }
        `;
        assistantButtonStyle = buttonStyle;
        document.head.append(buttonStyle);

        const host = document.createElement('div');
        host.id = namespace + '-panel-host';
        host.style.cssText = 'display:contents;position:static';
        panelHost = host;
        uiGeneration++;

        // Keep the sidebar isolated in Shadow DOM; the button itself is a
        // native button element in Polarion's light-DOM action container.
        const root = host.attachShadow({ mode: 'open' });
        root.host.style.setProperty('--assistant-accent', settings.accentColor);
        root.host.style.setProperty('--assistant-accent-dark', darken(settings.accentColor));
        root.host.style.setProperty('--assistant-accent-text', '#fff');

        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = '/polarion/aiassistant/assets/assistant.css';

        root.append(css);

        // Chat sidebar.
        panel = document.createElement('aside');
        panel.className = 'panel';
        panel.classList.add('theme-' + settings.theme);
        panel.style.width = Math.min(settings.sidebarWidth, window.innerWidth / 2) + 'px';
        panel.style.position = 'fixed';
        panel.style.zIndex = '99990';
        panel.style.top = '56px';
        panel.style.right = '12px';
        panel.style.bottom = '12px';
        panel.style.boxSizing = 'border-box';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.transform = 'translateX(calc(100% + 16px))';
        panel.style.visibility = 'hidden';
        panel.style.setProperty('--assistant-accent', settings.accentColor);
        panel.style.setProperty('--assistant-accent-dark', darken(settings.accentColor));
        panel.style.setProperty('--assistant-accent-text', '#fff');
        panel.setAttribute('aria-hidden', 'true');

        panel.innerHTML = `
            <div
                class="resize"
                role="separator"
                aria-orientation="vertical"
                aria-label="Resize assistant panel"
                tabindex="0">
            </div>

            <div class="top">
                <div class="brand">
                    <span class="mark">✦</span>

                    <div>
                        <strong class="assistant-name"></strong>

                        <small>
                            <i class="status"></i>
                            <span class="mode">Connecting…</span>
                        </small>
                    </div>
                </div>

                <div>
                    <button
                        class="icon new"
                        title="New chat"
                        aria-label="New chat">
                        ＋
                    </button>

                    <button
                        class="icon close"
                        title="Close assistant"
                        aria-label="Close assistant">
                        ×
                    </button>
                </div>
            </div>

            <div
                class="thread"
                role="log"
                aria-live="polite">
            </div>

            <div class="composer">
                <textarea
                    rows="1"
                    placeholder="Ask about requirements, tests, traceability…"
                    aria-label="Message">
                </textarea>

                <div class="compose-foot">
                    <span>Enter to send · Shift+Enter for newline</span>

                    <button class="send" disabled>
                        Send ↑
                    </button>
                </div>
            </div>
        `;

        root.append(panel);
        panel.querySelector('.assistant-name').textContent = settings.name;

        log = panel.querySelector('.thread');
        input = panel.querySelector('textarea');
        send = panel.querySelector('.send');

        // --------------------------------------------------
        // Open and close the sidebar
        // --------------------------------------------------

        function togglePanel() {
            const isOpen = !panel.classList.contains('open');

            panel.classList.toggle('open', isOpen);
            panel.setAttribute('aria-hidden', String(!isOpen));
            panel.style.transform = isOpen
                ? 'translateX(0)'
                : 'translateX(calc(100% + 16px))';
            panel.style.visibility = isOpen ? 'visible' : 'hidden';

            button.setAttribute('aria-expanded', String(isOpen));

            button.title = isOpen
                ? 'Close ' + settings.name
                : 'Open ' + settings.name;

            button.setAttribute(
                'aria-label',
                button.title
            );

            if (isOpen) {
                input.focus();
            }
        }

        button.addEventListener('click', togglePanel);

        panel.querySelector('.close').addEventListener(
            'click',
            togglePanel
        );

        root.addEventListener('keydown', (event) => {
            if (
                event.key === 'Escape' &&
                panel.classList.contains('open')
            ) {
                togglePanel();
            button.focus();
            }
        });

        // --------------------------------------------------
        // Resize the sidebar
        // --------------------------------------------------

        const resizeHandle = panel.querySelector('.resize');

        function getResizeLimits() {
            return {
                min: Math.min(360, window.innerWidth / 3),
                max: window.innerWidth / 2
            };
        }

        let resizeStart = null;

        resizeHandle.addEventListener('pointerdown', (event) => {
            event.preventDefault();

            resizeHandle.setPointerCapture(event.pointerId);

            resizeStart = {
                x: event.clientX,
                width: panel.getBoundingClientRect().width
            };

            panel.classList.add('resizing');
        });

        resizeHandle.addEventListener('pointermove', (event) => {
            if (!resizeStart) {
                return;
            }

            const limits = getResizeLimits();

            const width = resizeStart.width +
                resizeStart.x -
                event.clientX;

            panel.style.width = Math.max(
                limits.min,
                Math.min(limits.max, width)
            ) + 'px';
        });

        function finishResize() {
            resizeStart = null;
            panel.classList.remove('resizing');
        }

        resizeHandle.addEventListener(
            'pointerup',
            finishResize
        );

        resizeHandle.addEventListener(
            'pointercancel',
            finishResize
        );

        resizeHandle.addEventListener('keydown', (event) => {
            if (
                event.key !== 'ArrowLeft' &&
                event.key !== 'ArrowRight'
            ) {
                return;
            }

            event.preventDefault();

            const limits = getResizeLimits();

            const currentWidth = panel.getBoundingClientRect().width;

            const change = event.key === 'ArrowLeft'
                ? 16
                : -16;

            const width = currentWidth + change;

            panel.style.width = Math.max(
                limits.min,
                Math.min(limits.max, width)
            ) + 'px';
        });

        // --------------------------------------------------
        // New conversation
        // --------------------------------------------------

        panel.querySelector('.new').addEventListener(
            'click',
            welcome
        );

        // --------------------------------------------------
        // Message composer
        // --------------------------------------------------

        input.addEventListener('input', () => {
            send.disabled = !input.value.trim() || pending;

            input.style.height = 'auto';

            input.style.height = Math.min(
                input.scrollHeight,
                150
            ) + 'px';
        });

        input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                submit();
            }
        });

        send.addEventListener('click', () => {
            submit();
        });

        // --------------------------------------------------
        // Check AI service status
        // --------------------------------------------------

        const mode = panel.querySelector('.mode');
        const status = panel.querySelector('.status');
        mode.textContent = settings.mode === 'mock'
            ? 'Development mock'
            : settings.mode === 'unconfigured' ? 'AI service not configured' : 'AI service';
        status.classList.toggle('mock', settings.mode === 'mock');

        welcome();
    }

    function destroyAssistantUi() {
        if (!assistantButton && !panelHost && !assistantButtonStyle) return;

        assistantButton?.remove();
        panelHost?.remove();
        assistantButtonStyle?.remove();
        assistantButton = null;
        assistantButtonStyle = null;
        panelHost = null;
        panel = null;
        log = null;
        input = null;
        send = null;
        pending = false;
        uiGeneration++;
    }

    function observeHeaderAnchor(anchor) {
        if (!headerObserver || anchor === observedHeaderAnchor) return;
        headerObserver.disconnect();
        discoveryObserver.disconnect();
        observedHeaderAnchor = anchor;
        if (!anchor) {
            discoveryObserver.observe(document.documentElement, {
                childList: true,
                subtree: true
            });
            return;
        }
        for (let node = anchor; node; node = node.parentElement) {
            headerObserver.observe(node, {
                childList: true,
                subtree: node === anchor,
                attributes: true,
                characterData: node === anchor,
                attributeFilter: ['alt', 'aria-hidden', 'aria-label', 'class', 'hidden', 'src', 'style', 'title']
            });
        }
    }

    function findSiemensBranding() {
        const candidates = Array.from(document.querySelectorAll(
            'a, button, img, svg, [role="img"], [aria-label], [title], span, div'
        )).filter((element) => {
            if (element.id === namespace + '-button' || element.closest('#' + namespace + '-panel-host')) return false;
            const labels = [
                element.getAttribute('aria-label'), element.getAttribute('title'),
                element.getAttribute('alt'), element.textContent
            ].filter(Boolean).map((value) => String(value).trim());
            const source = element.getAttribute('src') || '';
            const branded = labels.some((label) => /^SIEMENS$/i.test(label))
                || /(?:siemens.*logo|logo.*siemens)/i.test(source);
            if (!branded || element.closest('[hidden], [aria-hidden="true"]')) return false;
            const rect = element.getBoundingClientRect();
            const style = window.getComputedStyle(element);
            return rect.width > 0 && rect.height > 0
                && style.display !== 'none' && style.visibility !== 'hidden'
                && style.visibility !== 'collapse';
        });

        // Prefer the smallest visible Siemens mark and its link wrapper, when present.
        candidates.sort((left, right) => {
            const leftArea = left.getBoundingClientRect().width * left.getBoundingClientRect().height;
            const rightArea = right.getBoundingClientRect().width * right.getBoundingClientRect().height;
            return leftArea - rightArea;
        });
        const mark = candidates[0];
        return mark ? (mark.closest('a') || mark) : null;
    }

    function assistantDisplayName() {
        return typeof settings.name === 'string' && settings.name.trim()
            ? settings.name.trim()
            : 'AI';
    }

    function scheduleReconcile() {
        if (reconcileScheduled) return;
        reconcileScheduled = true;
        window.setTimeout(() => {
            reconcileScheduled = false;
            init();
        }, 50);
    }

    // --------------------------------------------------
    // Display the welcome screen
    // --------------------------------------------------

    function welcome() {
        history = [];

        log.replaceChildren();

        const welcomePanel = document.createElement('div');
        welcomePanel.className = 'welcome';

        welcomePanel.innerHTML = `
            <div class="welcome-icon">✦</div>

            <h2>How can ${escapeHtml(settings.name)} help?</h2>

            <p>
                Ask about requirements, test coverage, work items,
                or traceability. Page content is not shared unless
                you include it.
            </p>

            <div class="suggestions"></div>
        `;

        const suggestions = [
            'Explain the current requirement',
            'Summarize the current work item',
            'Find missing verification coverage',
            'Explain traceability relationships',
            'Help write a better requirement'
        ];

        const suggestionContainer =
            welcomePanel.querySelector('.suggestions');

        suggestions.forEach((suggestion) => {
            const button = document.createElement('button');

            button.textContent = suggestion;

            button.addEventListener('click', () => {
                input.value = suggestion;

                input.dispatchEvent(
                    new Event('input')
                );

                submit();
            });

            suggestionContainer.append(button);
        });

        log.append(welcomePanel);
    }

    // --------------------------------------------------
    // Render inline Markdown safely
    // --------------------------------------------------

    function inline(element, text) {
        const pattern =
            /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\([^)]+\))/g;

        let position = 0;
        let match;

        while ((match = pattern.exec(text)) !== null) {
            element.append(
                document.createTextNode(
                    text.slice(position, match.index)
                )
            );

            const token = match[0];
            let node;

            if (token[0] === '`') {
                node = document.createElement('code');
                node.textContent = token.slice(1, -1);

            } else if (token.startsWith('**')) {
                node = document.createElement('strong');
                node.textContent = token.slice(2, -2);

            } else if (token[0] === '*') {
                node = document.createElement('em');
                node.textContent = token.slice(1, -1);

            } else {
                const link = token.match(
                    /^\[([^\]]+)\]\(([^)]+)\)$/
                );

                let url;

                try {
                    url = new URL(
                        link[2],
                        window.location.origin
                    );
                } catch {
                    url = null;
                }

                if (
                    url &&
                    (
                        url.protocol === 'https:' ||
                        url.origin === window.location.origin
                    )
                ) {
                    node = document.createElement('a');

                    node.textContent = link[1];
                    node.href = url.href;
                    node.rel = 'noopener noreferrer';
                    node.target = '_blank';

                } else {
                    node = document.createTextNode(link[1]);
                }
            }

            element.append(node);

            position = pattern.lastIndex;
        }

        element.append(
            document.createTextNode(
                text.slice(position)
            )
        );
    }

    // --------------------------------------------------
    // Render Markdown blocks
    // --------------------------------------------------

    function markdown(element, text) {
        const lines = text.split(/\r?\n/);

        let index = 0;

        while (index < lines.length) {
            const line = lines[index];

            if (!line.trim()) {
                index++;
                continue;
            }

            // Code blocks
            if (line.startsWith('```')) {
                index++;

                const codeLines = [];

                while (
                    index < lines.length &&
                    !lines[index].startsWith('```')
                ) {
                    codeLines.push(lines[index]);
                    index++;
                }

                if (
                    index < lines.length &&
                    lines[index].startsWith('```')
                ) {
                    index++;
                }

                const pre = document.createElement('pre');
                const code = document.createElement('code');
                const copyButton = document.createElement('button');

                code.textContent = codeLines.join('\n');

                copyButton.className = 'copy';
                copyButton.textContent = 'Copy';

                copyButton.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard.writeText(
                            code.textContent
                        );

                        copyButton.textContent = 'Copied';
                    } catch {
                        copyButton.textContent = 'Copy failed';
                    }
                });

                pre.append(code, copyButton);
                element.append(pre);

                continue;
            }

            // Headings
            if (/^#{1,4}\s/.test(line)) {
                const headingLevel = line.match(/^#+/)[0].length;

                const heading = document.createElement(
                    'h' + headingLevel
                );

                inline(
                    heading,
                    line.slice(headingLevel).trim()
                );

                element.append(heading);

                index++;
                continue;
            }

            // Markdown tables
            const separatorPattern =
                /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/;

            if (
                line.includes('|') &&
                index + 1 < lines.length &&
                separatorPattern.test(lines[index + 1])
            ) {
                const header = splitTableRow(line);

                index += 2;

                const rows = [];

                while (
                    index < lines.length &&
                    lines[index].includes('|') &&
                    lines[index].trim()
                ) {
                    rows.push(splitTableRow(lines[index]));
                    index++;
                }

                const table = document.createElement('table');
                const thead = document.createElement('thead');
                const headerRow = document.createElement('tr');

                header.forEach((value) => {
                    const cell = document.createElement('th');

                    inline(cell, value);

                    headerRow.append(cell);
                });

                thead.append(headerRow);
                table.append(thead);

                const tbody = document.createElement('tbody');

                rows.forEach((row) => {
                    const tableRow = document.createElement('tr');

                    row.forEach((value) => {
                        const cell = document.createElement('td');

                        inline(cell, value);

                        tableRow.append(cell);
                    });

                    tbody.append(tableRow);
                });

                table.append(tbody);
                element.append(table);

                continue;
            }

            // Ordered and unordered lists
            const listPattern = /^(?:[-*+]|\d+\.)\s+/;

            if (listPattern.test(line)) {
                const ordered = /^\d+\./.test(line);

                const list = document.createElement(
                    ordered ? 'ol' : 'ul'
                );

                while (
                    index < lines.length &&
                    listPattern.test(lines[index])
                ) {
                    const item = document.createElement('li');

                    inline(
                        item,
                        lines[index].replace(listPattern, '')
                    );

                    list.append(item);

                    index++;
                }

                element.append(list);

                continue;
            }

            // Paragraph
            const paragraph = document.createElement('p');

            inline(paragraph, line);

            element.append(paragraph);

            index++;
        }
    }

    function splitTableRow(row) {
        return row
            .trim()
            .replace(/^\|/, '')
            .replace(/\|$/, '')
            .split('|')
            .map((cell) => cell.trim());
    }

    // --------------------------------------------------
    // Add a message to the conversation
    // --------------------------------------------------

    function addMessage(text, role) {
        const message = document.createElement('article');
        const author = document.createElement('div');
        const body = document.createElement('div');

        message.className = 'message ' + role;

        author.className = 'who';
        author.textContent = role === 'user'
            ? 'You'
            : settings.name;

        body.className = 'body';

        if (role === 'user') {
            body.textContent = text;
        } else {
            markdown(body, text);
        }

        message.append(author, body);
        log.append(message);

        log.scrollTop = log.scrollHeight;
    }

    // --------------------------------------------------
    // Send a message to the backend
    // --------------------------------------------------

    async function submit(retry = false) {
        if (pending) {
            return;
        }
        const requestGeneration = uiGeneration;

        const value = retry
            ? last
            : input.value.trim();

        if (!value) {
            return;
        }

        last = value;

        if (!retry) {
            history.push({
                role: 'User',
                content: value
            });

            addMessage(value, 'user');

            input.value = '';
            input.style.height = 'auto';
        }

        pending = true;
        send.disabled = true;

        const waiting = document.createElement('div');

        waiting.className = 'thinking';
        waiting.textContent = 'Thinking…';

        log.append(waiting);
        log.scrollTop = log.scrollHeight;

        try {
            // Send recent conversation context.
            const context = history
                .slice(-8)
                .map((item) => {
                    return item.role + ': ' +
                        item.content.slice(-1200);
                })
                .join('\n\n');

            const response = await fetch(api, {
                method: 'POST',
                credentials: 'same-origin',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    message: context
                })
            });

            const data = await response.json();

            if (requestGeneration !== uiGeneration) return;

            waiting.remove();

            if (!response.ok) {
                throw new Error(
                    data.error || 'Request failed'
                );
            }

            history.push({
                role: 'Assistant',
                content: data.reply
            });

            const reply = data.mode === 'mock'
                ? '_Development mock_\n\n' + data.reply
                : data.reply;

            addMessage(reply, 'assistant');

        } catch (error) {
            if (requestGeneration !== uiGeneration) return;
            waiting.remove();

            const errorContainer =
                document.createElement('div');

            const errorText =
                document.createElement('span');

            const retryButton =
                document.createElement('button');

            errorContainer.className = 'request-error';
            errorText.textContent =
                (error.message || 'Request failed') + ' ';

            retryButton.textContent = 'Retry';

            retryButton.addEventListener('click', () => {
                errorContainer.remove();
                submit(true);
            });

            errorContainer.append(
                errorText,
                retryButton
            );

            log.append(errorContainer);

        } finally {
            if (requestGeneration === uiGeneration) {
                pending = false;
                send.disabled = !input.value.trim();
                log.scrollTop = log.scrollHeight;
            }
        }
    }

    // --------------------------------------------------
    // Start the assistant
    // --------------------------------------------------

    // The UI stays hidden until the authorized configuration and native
    // Siemens branding anchor are both available.
    init();

    function refreshConfiguration() {
        return fetch('/polarion/aiassistant/api/config', {
        credentials: 'same-origin',
        cache: 'no-store'
        }).then((response) => {
            if (!response.ok) throw new Error('Configuration unavailable');
            return response.json();
        }).then((config) => {
            if (config.visible === false) {
                settings = { ...settings, ...config, visible: false };
                destroyAssistantUi();
                return;
            }
            const nextSettings = { ...settings, ...config, visible: true };
            const changed = Object.keys(config).some((key) => settings[key] !== nextSettings[key]);
            if (changed) destroyAssistantUi();
            settings = nextSettings;
            init();
        }).catch(() => {});
    }
    refreshConfiguration();
    // Administrators' changes are reflected on open Polarion pages as well.
    window.setInterval(refreshConfiguration, 60000);

    // Discover the right edge of the native header while absent; when found,
    // observe its subtree and ancestors to track Polarion header replacement.
    discoveryObserver = new MutationObserver(scheduleReconcile);
    headerObserver = new MutationObserver(scheduleReconcile);
    observeHeaderAnchor(findSiemensBranding());

    function darken(hex) {
        const value = parseInt(hex.slice(1), 16);
        const channels = [value >> 16, (value >> 8) & 255, value & 255]
            .map((channel) => Math.max(0, Math.round(channel * 0.82)));
        return '#' + channels.map((channel) => channel.toString(16).padStart(2, '0')).join('');
    }

    function escapeHtml(value) {
        return value.replace(/[&<>"']/g, (character) => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        })[character]);
    }

})();
