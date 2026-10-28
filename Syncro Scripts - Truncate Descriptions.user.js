// ==UserScript==
// @name         Syncro Scripts - Expandable Descriptions
// @namespace    https://texomans.com/
// @version      1.0.0
// @description  Collapses script descriptions to one line with individual expand/collapse buttons for overflowing text.
// @match        https://*.syncromsp.com/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Scripts%20-%20Truncate%20Descriptions.user.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Scripts%20-%20Truncate%20Descriptions.user.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const CELL_CLASS = 'tns-script-description-cell';
    const CONTENT_CLASS = 'tns-script-description-content';
    const BUTTON_CLASS = 'tns-script-description-toggle';
    const EXPANDED_CLASS = 'tns-script-description-expanded';
    const OVERFLOW_CLASS = 'tns-script-description-overflow';
    const states = new WeakMap();
    let sequence = 0;
    let updateQueued = false;

    const style = document.createElement('style');
    style.textContent = `
        .${CELL_CLASS} { position: relative; }
        .${CELL_CLASS} .${CONTENT_CLASS} {
            display: block;
            line-height: 1.5em;
            max-height: 1.5em;
            overflow: hidden;
            overflow-wrap: anywhere;
        }
        .${CELL_CLASS}:not(.${EXPANDED_CLASS}) .${CONTENT_CLASS} * {
            font-size: inherit !important;
            line-height: inherit !important;
            margin-top: 0 !important;
            margin-bottom: 0 !important;
        }
        .${CELL_CLASS}.${OVERFLOW_CLASS} .${CONTENT_CLASS} { margin-right: 30px; }
        .${CELL_CLASS}.${EXPANDED_CLASS} .${CONTENT_CLASS} {
            max-height: none;
            overflow: visible;
        }
        .${CELL_CLASS} .${BUTTON_CLASS} {
            position: absolute;
            right: 4px;
            top: 5px;
            width: 24px;
            height: 24px;
            padding: 0;
            border: 1px solid currentColor;
            border-radius: 4px;
            color: inherit;
            background: transparent;
            cursor: pointer;
            line-height: 20px;
            text-align: center;
            font-size: 16px;
        }
        .${BUTTON_CLASS}[hidden] { display: none !important; }
        .${BUTTON_CLASS}:focus-visible { outline: 2px solid #59bfff; outline-offset: 2px; }
    `;
    document.head.appendChild(style);

    const normalizedText = element => element.textContent.replace(/\s+/g, ' ').trim();

    function findScriptTables() {
        return Array.from(document.querySelectorAll('table')).flatMap(table => {
            const rows = Array.from(table.querySelectorAll('thead tr'))
                .filter(row => row.closest('table') === table);
            const row = rows.find(row => {
                const labels = Array.from(row.cells, cell => normalizedText(cell).toLowerCase());
                return ['name', 'type', 'description'].every(label => labels.includes(label));
            });
            if (!row) return [];
            return [{ table, index: Array.from(row.cells).findIndex(cell => normalizedText(cell).toLowerCase() === 'description') }];
        });
    }

    function refreshCell(cell) {
        let state = states.get(cell);
        if (!state || state.content.parentNode !== cell || state.button.parentNode !== cell) {
            // Syncro may replace contents while retaining the table cell itself.
            cell.querySelectorAll(`:scope > .${BUTTON_CLASS}`).forEach(button => button.remove());
            let content = cell.querySelector(`:scope > .${CONTENT_CLASS}`);
            if (!content) {
                if (!cell.hasChildNodes()) return;
                content = document.createElement('div');
                content.className = CONTENT_CLASS;
                content.id = `tns-script-description-${++sequence}`;
                // Preserve original nodes, formatting, links and their handlers.
                content.append(...cell.childNodes);
                cell.appendChild(content);
            }
            const button = document.createElement('button');
            button.type = 'button';
            button.className = BUTTON_CLASS;
            button.setAttribute('aria-controls', content.id);
            cell.appendChild(button);
            cell.classList.add(CELL_CLASS);
            cell.classList.remove(EXPANDED_CLASS, OVERFLOW_CLASS);
            state = { content, button, expanded: false };
            states.set(cell, state);
            button.addEventListener('click', event => {
                event.stopPropagation();
                state.expanded = !state.expanded;
                renderState(cell, state);
                queueUpdate();
            });
        }
        const { content, button, expanded } = state;
        // Measure at the full available width so a button never creates its own overflow.
        // Expanded content can still be measured against the one-line height.
        cell.classList.remove(OVERFLOW_CLASS);
        const lineHeight = parseFloat(getComputedStyle(content).lineHeight);
        const overflowing = content.scrollHeight > lineHeight + 1 || content.scrollWidth > content.clientWidth + 1;
        const visible = expanded || overflowing;
        cell.classList.toggle(OVERFLOW_CLASS, visible);
        button.hidden = !visible;
        renderState(cell, state);
    }

    function renderState(cell, state) {
        cell.classList.toggle(EXPANDED_CLASS, state.expanded);
        const label = state.expanded ? 'Collapse description' : 'Expand description';
        const glyph = state.expanded ? '▴' : '▾';
        if (state.button.textContent !== glyph) state.button.textContent = glyph;
        state.button.title = label;
        state.button.setAttribute('aria-label', label);
        state.button.setAttribute('aria-expanded', String(state.expanded));
    }

    const resizeObserver = new ResizeObserver(queueUpdate);
    const observedTables = new Set();

    function update() {
        // Detect the list by its actual controls and columns, not a guessed URL.
        const newScript = Array.from(document.querySelectorAll('a, button')).find(element =>
            /^\+?\s*New Script$/i.test(normalizedText(element))
        );
        const tables = newScript ? findScriptTables() : [];
        for (const table of observedTables) {
            if (!tables.some(item => item.table === table)) {
                resizeObserver.unobserve(table);
                observedTables.delete(table);
            }
        }
        tables.forEach(({ table, index }) => {
            if (!observedTables.has(table)) {
                observedTables.add(table);
                resizeObserver.observe(table);
            }
            Array.from(table.tBodies).forEach(body => Array.from(body.rows).forEach(row => {
                const cell = row.cells[index];
                if (!cell || Array.from(row.cells).some(item => item.colSpan !== 1)) return;
                refreshCell(cell);
            }));
        });
    }

    function queueUpdate() {
        if (updateQueued) return;
        updateQueued = true;
        requestAnimationFrame(() => {
            updateQueued = false;
            update();
        });
    }

    update();
    new MutationObserver(queueUpdate).observe(document.body, {
        childList: true,
        characterData: true,
        subtree: true
    });
    window.addEventListener('resize', queueUpdate);
    document.addEventListener('turbo:load', queueUpdate);
    document.addEventListener('turbolinks:load', queueUpdate);
    document.fonts?.ready.then(queueUpdate);
})();
