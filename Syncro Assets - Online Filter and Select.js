// ==UserScript==
// @name         Syncro Assets - Online Filter and Select
// @namespace    https://texomans.com/
// @version      1.0.1
// @description  Shows online asset counts and adds Online Only and Select Online controls to the Syncro Assets page.
// @match        https://*.syncromsp.com/customer_assets*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Online%20Filter%20and%20Select.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Online%20Filter%20and%20Select.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const TOOLBAR_ID = 'tns-online-assets-toolbar';
    const STYLE_ID = 'tns-online-assets-style';
    const FILTER_HIDDEN_CLASS = 'tns-online-filter-hidden';

    let onlineOnlyEnabled = false;
    let updatePending = false;

    function isAssetsIndexPage() {
        return (
            document.body?.dataset?.currentPage === 'assets-index' ||
            !!document.querySelector('table[data-testid="assets-table"]')
        );
    }

    function getAssetsTable() {
        return document.querySelector(
            'table[data-testid="assets-table"]'
        );
    }

    function getAssetRows() {
        const table = getAssetsTable();

        if (!table) {
            return [];
        }

        return Array.from(
            table.querySelectorAll(
                'tbody tr[data-testid^="asset-row-"], tbody tr'
            )
        ).filter(row =>
            !!row.querySelector(
                'input.selectedId, input[type="checkbox"][value]'
            )
        );
    }

    function normalizeText(value) {
        return (value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    function getStatusColumnIndex(table) {
        if (!table) {
            return -1;
        }

        const headers = Array.from(
            table.querySelectorAll('thead th')
        );

        const terms = [
            'status',
            'online',
            'agent status',
            'rmm status',
            'syncro status'
        ];

        return headers.findIndex(header => {
            const text = normalizeText(
                header.textContent
            );

            return terms.some(term =>
                text === term ||
                text.includes(term)
            );
        });
    }

    function elementIndicatesOffline(element) {
        if (!element) {
            return false;
        }

        const attributes = [
            element.getAttribute('title'),
            element.getAttribute('aria-label'),
            element.getAttribute('data-original-title'),
            element.getAttribute('data-status'),
            element.getAttribute('data-state'),
            element.getAttribute('data-online')
        ]
            .filter(Boolean)
            .map(normalizeText);

        if (
            attributes.some(value =>
                value === 'offline' ||
                value === 'false' ||
                value.includes('currently offline') ||
                value.includes('agent offline') ||
                value.includes('device offline')
            )
        ) {
            return true;
        }

        const classText = normalizeText(
            typeof element.className === 'string'
                ? element.className
                : ''
        );

        return (
            /\bstatus-offline\b/.test(classText) ||
            /\basset-offline\b/.test(classText) ||
            /\bis-offline\b/.test(classText) ||
            /\boffline\b/.test(classText)
        );
    }

    function elementIndicatesOnline(element) {
        if (!element) {
            return false;
        }

        const attributes = [
            element.getAttribute('title'),
            element.getAttribute('aria-label'),
            element.getAttribute('data-original-title'),
            element.getAttribute('data-status'),
            element.getAttribute('data-state'),
            element.getAttribute('data-online')
        ]
            .filter(Boolean)
            .map(normalizeText);

        if (
            attributes.some(value =>
                value === 'online' ||
                value === 'true' ||
                value.includes('currently online') ||
                value.includes('agent online') ||
                value.includes('device online')
            )
        ) {
            return true;
        }

        const classText = normalizeText(
            typeof element.className === 'string'
                ? element.className
                : ''
        );

        if (
            /\bstatus-online\b/.test(classText) ||
            /\basset-online\b/.test(classText) ||
            /\bis-online\b/.test(classText) ||
            /\bonline\b/.test(classText)
        ) {
            return true;
        }

        if (
            classText.includes('text-success') &&
            (
                classText.includes('circle') ||
                classText.includes('status') ||
                element.tagName === 'I'
            )
        ) {
            return true;
        }

        return false;
    }

    function inspectElementForStatus(root) {
        if (!root) {
            return null;
        }

        const elements = [
            root,
            ...root.querySelectorAll(
                [
                    '[title]',
                    '[aria-label]',
                    '[data-original-title]',
                    '[data-status]',
                    '[data-state]',
                    '[data-online]',
                    '.online',
                    '.offline',
                    '.status-online',
                    '.status-offline',
                    '.asset-online',
                    '.asset-offline',
                    '.text-success'
                ].join(',')
            )
        ];

        /*
         * Check offline first so labels such as "Last Online"
         * don't accidentally make an offline asset look online.
         */
        for (const element of elements) {
            if (elementIndicatesOffline(element)) {
                return false;
            }
        }

        for (const element of elements) {
            if (elementIndicatesOnline(element)) {
                return true;
            }
        }

        return null;
    }

    function isAssetOnline(row) {
        const statusColumnIndex =
            getStatusColumnIndex(
                getAssetsTable()
            );

        /*
         * Prefer the actual Status column when Syncro exposes one.
         */
        if (statusColumnIndex >= 0) {
            const cells =
                row.querySelectorAll('td');

            const statusCell =
                cells[statusColumnIndex];

            if (statusCell) {
                const result =
                    inspectElementForStatus(
                        statusCell
                    );

                if (result !== null) {
                    return result;
                }

                const text = normalizeText(
                    statusCell.textContent
                );

                if (text === 'offline') {
                    return false;
                }

                if (text === 'online') {
                    return true;
                }
            }
        }

        /*
         * Then inspect the row for explicit online/offline
         * attributes or status icons.
         */
        const rowResult =
            inspectElementForStatus(row);

        if (rowResult !== null) {
            return rowResult;
        }

        /*
         * Conservative text fallback.
         */
        const possibleLabels =
            row.querySelectorAll(
                'span, small, strong, div, i'
            );

        for (const element of possibleLabels) {
            if (
                normalizeText(
                    element.textContent
                ) === 'offline'
            ) {
                return false;
            }
        }

        for (const element of possibleLabels) {
            if (
                normalizeText(
                    element.textContent
                ) === 'online'
            ) {
                return true;
            }
        }

        /*
         * Unknown = offline for selection purposes.
         */
        return false;
    }

    function getAssetCheckbox(row) {
        return (
            row.querySelector(
                'input.selectedId[type="checkbox"]'
            ) ||
            row.querySelector(
                'input.selectedId'
            ) ||
            row.querySelector(
                'input[type="checkbox"][value]'
            )
        );
    }

    function setCheckboxState(
        checkbox,
        checked
    ) {
        if (
            !checkbox ||
            checkbox.disabled ||
            checkbox.checked === checked
        ) {
            return;
        }

        /*
         * Click the real checkbox so Syncro's own bulk-selection
         * JavaScript knows the state changed.
         */
        checkbox.click();
    }

    function selectOnlineAssets() {
        const rows = getAssetRows();

        rows.forEach(row => {
            /*
             * Ignore assets hidden by Syncro itself.
             *
             * When Online Only is enabled, online assets remain visible,
             * so they still qualify here.
             */
            if (
                !row.classList.contains(
                    FILTER_HIDDEN_CLASS
                ) &&
                (
                    row.getClientRects().length === 0 ||
                    window.getComputedStyle(row).display === 'none'
                )
            ) {
                return;
            }

            const checkbox =
                getAssetCheckbox(row);

            if (!checkbox) {
                return;
            }

            setCheckboxState(
                checkbox,
                isAssetOnline(row)
            );
        });
    }

    function applyOnlineFilter() {
        getAssetRows().forEach(row => {
            const online =
                isAssetOnline(row);

            row.dataset.tnsOnline =
                online ? 'true' : 'false';

            row.classList.toggle(
                FILTER_HIDDEN_CLASS,
                onlineOnlyEnabled && !online
            );
        });
    }

    function updateCounter() {
        const counter =
            document.querySelector(
                `#${TOOLBAR_ID} [data-tns-online-count]`
            );

        if (!counter) {
            return;
        }

        const rows = getAssetRows();

        const total = rows.length;

        const online =
            rows.filter(
                isAssetOnline
            ).length;

        const newText =
            `🟢 ${online} Online / ${total} Total`;

        /*
         * Important:
         * Don't replace the text node unless the value actually changed.
         * Replacing it unnecessarily triggers MutationObserver.
         */
        if (counter.textContent !== newText) {
            counter.textContent = newText;
        }
    }

    function updateOnlineOnlyButton() {
        const button =
            document.querySelector(
                `#${TOOLBAR_ID} [data-tns-online-only]`
            );

        if (!button) {
            return;
        }

        button.classList.toggle(
            'btn-success',
            onlineOnlyEnabled
        );

        button.classList.toggle(
            'btn-default',
            !onlineOnlyEnabled
        );

        button.setAttribute(
            'aria-pressed',
            onlineOnlyEnabled
                ? 'true'
                : 'false'
        );

        const newText =
            onlineOnlyEnabled
                ? '✓ Online Only'
                : 'Online Only';

        if (button.textContent !== newText) {
            button.textContent = newText;
        }
    }

    function toggleOnlineOnly(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        onlineOnlyEnabled =
            !onlineOnlyEnabled;

        applyOnlineFilter();
        updateOnlineOnlyButton();
        updateCounter();
    }

    function handleSelectOnline(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }

        selectOnlineAssets();
        updateCounter();
    }

    function addStyles() {
        if (
            document.getElementById(
                STYLE_ID
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id = STYLE_ID;

        style.textContent = `
            .${FILTER_HIDDEN_CLASS} {
                display: none !important;
            }

            #${TOOLBAR_ID} {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 8px;
                margin: 10px 0;
            }

            #${TOOLBAR_ID} .tns-online-count {
                font-weight: 600;
                margin-right: 4px;
                white-space: nowrap;
            }

            #${TOOLBAR_ID} .tns-online-actions {
                display: flex;
                align-items: center;
                gap: 6px;
            }
        `;

        document.head.appendChild(
            style
        );
    }

    function findToolbarInsertionPoint(
        table
    ) {
        const wrapper =
            table.closest(
                '.dataTables_wrapper, [data-testid="assets-table-wrapper"]'
            );

        if (wrapper) {
            return {
                parent: wrapper,
                before: table
            };
        }

        return {
            parent: table.parentElement,
            before: table
        };
    }

    function createToolbar() {
        if (
            document.getElementById(
                TOOLBAR_ID
            )
        ) {
            return;
        }

        const table =
            getAssetsTable();

        if (!table) {
            return;
        }

        const insertion =
            findToolbarInsertionPoint(
                table
            );

        if (!insertion?.parent) {
            return;
        }

        const toolbar =
            document.createElement(
                'div'
            );

        toolbar.id = TOOLBAR_ID;

        toolbar.innerHTML = `
            <span
                class="tns-online-count"
                data-tns-online-count
            >
                🟢 0 Online / 0 Total
            </span>

            <span class="tns-online-actions">
                <button
                    type="button"
                    class="btn btn-default btn-sm"
                    data-tns-online-only
                    aria-pressed="false"
                    title="Show only online assets"
                >
                    Online Only
                </button>

                <button
                    type="button"
                    class="btn btn-default btn-sm"
                    data-tns-select-online
                    title="Select currently online assets"
                >
                    Select Online
                </button>
            </span>
        `;

        toolbar
            .querySelector(
                '[data-tns-online-only]'
            )
            .addEventListener(
                'click',
                toggleOnlineOnly
            );

        toolbar
            .querySelector(
                '[data-tns-select-online]'
            )
            .addEventListener(
                'click',
                handleSelectOnline
            );

        insertion.parent.insertBefore(
            toolbar,
            insertion.before
        );
    }

    function update() {
        if (!isAssetsIndexPage()) {
            return;
        }

        addStyles();
        createToolbar();
        applyOnlineFilter();
        updateOnlineOnlyButton();
        updateCounter();
    }

    function scheduleUpdate() {
        if (updatePending) {
            return;
        }

        updatePending = true;

        window.setTimeout(() => {
            updatePending = false;
            update();
        }, 250);
    }

    function mutationIsInsideOurToolbar(
        mutation
    ) {
        const target =
            mutation.target;

        if (
            target instanceof Element &&
            (
                target.id === TOOLBAR_ID ||
                target.closest(
                    `#${TOOLBAR_ID}`
                )
            )
        ) {
            return true;
        }

        return false;
    }

    const observer =
        new MutationObserver(
            mutations => {
                /*
                 * This is the v1.0.1 fix:
                 *
                 * Ignore mutations caused exclusively by our own toolbar.
                 * Otherwise changing button text or counter text can cause
                 * an endless observer/update loop.
                 */
                const realSyncroChange =
                    mutations.some(
                        mutation =>
                            !mutationIsInsideOurToolbar(
                                mutation
                            )
                    );

                if (realSyncroChange) {
                    scheduleUpdate();
                }
            }
        );

    scheduleUpdate();

    window.addEventListener(
        'load',
        scheduleUpdate
    );

    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );
})();
