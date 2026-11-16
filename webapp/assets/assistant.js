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

    let panel;
    let log;
    let input;
    let send;
    let pending = false;
    let last = '';
    let history = [];
    let settings = {
        visible: true,
        enabled: true,
        showHeaderButton: true,
        name: 'AI',
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
        if (!document.body || document.getElementById(namespace + '-host')) {
            return;
        }
        if (!settings || settings.visible === false) return;

        const host = document.createElement('div');
        host.id = namespace + '-host';

        host.style.cssText = [
            'position:fixed',
            'top:7px',
            'right:9vw',
            'z-index:100001'
        ].join(';');
        if (settings.headerPlacement === 'branding') {
            const brand = findBrandElement();
            if (brand) {
                const bounds = brand.getBoundingClientRect();
                host.style.left = Math.max(8, bounds.right + 8) + 'px';
                host.style.right = 'auto';
                host.style.top = Math.max(4, bounds.top) + 'px';
            }
        }

        document.body.append(host);

        // Create an isolated Shadow DOM for the assistant UI.
        const root = host.attachShadow({ mode: 'open' });
        root.host.style.setProperty('--assistant-accent', settings.accentColor);
        root.host.style.setProperty('--assistant-accent-dark', darken(settings.accentColor));
        root.host.style.setProperty('--assistant-accent-text', '#fff');

        const css = document.createElement('link');
        css.rel = 'stylesheet';
        css.href = '/polarion/aiassistant/assets/assistant.css';

        root.append(css);

        // AI toggle button.
        const toggle = document.createElement('button');

        toggle.className = 'entry';
        toggle.title = 'Open ' + settings.name;
        toggle.setAttribute('aria-label', 'Open ' + settings.name);
        toggle.setAttribute('aria-expanded', 'false');

        toggle.innerHTML = '<span aria-hidden="true">✦</span> ';
        toggle.append(document.createTextNode(settings.name));

        root.append(toggle);

        // Chat sidebar.
        panel = document.createElement('aside');
        panel.className = 'panel';
        panel.classList.add('theme-' + settings.theme);
        panel.style.width = Math.min(settings.sidebarWidth, window.innerWidth / 2) + 'px';
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

            toggle.setAttribute('aria-expanded', String(isOpen));

            toggle.title = isOpen
                ? 'Close ' + settings.name
                : 'Open ' + settings.name;

            toggle.setAttribute(
                'aria-label',
                toggle.title
            );

            if (isOpen) {
                input.focus();
            }
        }

        toggle.addEventListener('click', togglePanel);

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
                toggle.focus();
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
            pending = false;

            send.disabled = !input.value.trim();

            log.scrollTop = log.scrollHeight;
        }
    }

    // --------------------------------------------------
    // Start the assistant
    // --------------------------------------------------

    // Render safe defaults immediately. A temporary config API failure must not
    // make the header entry disappear; chat remains protected by ChatServlet.
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
                document.getElementById(namespace + '-host')?.remove();
                return;
            }
            const nextSettings = { ...settings, ...config, visible: true };
            const changed = Object.keys(config).some((key) => settings[key] !== nextSettings[key]);
            if (changed) document.getElementById(namespace + '-host')?.remove();
            settings = nextSettings;
            init();
        }).catch(() => {});
    }
    refreshConfiguration();
    // Administrators' changes are reflected on open Polarion pages as well.
    window.setInterval(refreshConfiguration, 60000);

    // If Polarion renders page content dynamically, retry
    // initialization when the document structure changes.
    const observer = new MutationObserver(() => {
        init();
    });

    observer.observe(document.documentElement, {
        childList: true,
        subtree: true
    });

    function findBrandElement() {
        const candidates = document.querySelectorAll(
            'header img, header a, [role="banner"] img, [role="banner"] a, img[alt*="Siemens" i], img[alt*="Polarion" i], img[src*="siemens" i], img[src*="polarion" i]'
        );
        return Array.from(candidates).find((element) => {
            const text = [element.alt, element.title, element.getAttribute('aria-label'),
                element.getAttribute('src'), element.href].filter(Boolean).join(' ');
            return /siemens|polarion/i.test(text);
        });
    }

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
