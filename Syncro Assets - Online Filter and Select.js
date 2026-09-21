// ==UserScript==
// @name         Syncro Assets - Online Filter and Select
// @namespace    https://texomans.com/
// @version      1.0.0
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
        return (
            document.querySelector('table[data-testid="assets-table"]') ||
            document.querySelector('table')
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
        ).filter(row => {
            return !!row.querySelector('input.selectedId, input[type="checkbox"][value]');
        });
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

        const headers = Array.from(table.querySelectorAll('thead th'));

        const statusTerms = [
            'status',
            'online',
            'agent status',
            'rmm status',
            'syncro status'
        ];

        return headers.findIndex(header => {
            const text = normalizeText(header.textContent);

            return statusTerms.some(term => text === term || text.includes(term));
        });
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

        /*
         * Syncro commonly uses Bootstrap-style success indicators for
         * connected/healthy states. Limit this to circle/status-style
         * elements to avoid treating unrelated green text as online.
         */
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

        if (
            /\bstatus-offline\b/.test(classText) ||
            /\basset-offline\b/.test(classText) ||
            /\bis-offline\b/.test(classText) ||
            /\boffline\b/.test(classText)
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
         * Offline wins over online. This prevents strings such as
         * "Last Online" from causing an offline machine to be counted
         * as online.
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
        /*
         * First inspect explicit row-level attributes/classes.
         */
        const rowStatus = inspectElementForStatus(row);

        if (rowStatus !== null) {
            return rowStatus;
        }

        const table = getAssetsTable();
        const statusColumnIndex = getStatusColumnIndex(table);

        /*
         * If Syncro gives us a Status-type column, prioritize it.
         */
        if (statusColumnIndex >= 0) {
            const cells = row.querySelectorAll('td');
            const statusCell = cells[statusColumnIndex];

            if (statusCell) {
                const status = inspectElementForStatus(statusCell);

                if (status !== null) {
                    return status;
                }

                const text = normalizeText(statusCell.textContent);

                if (/^online$/.test(text)) {
                    return true;
                }

                if (/^offline$/.test(text)) {
                    return false;
                }
            }
        }

        /*
         * Final conservative fallback:
         * look for small elements whose entire visible text is "Online".
         *
         * We deliberately do NOT search row.textContent for the word
         * "online", because fields such as "Last Online" could otherwise
         * generate false positives.
         */
        const possibleLabels = row.querySelectorAll(
            'span, small, strong, div, i'
        );

        for (const element of possibleLabels) {
            const text = normalizeText(element.textContent);

            if (text === 'offline') {
                return false;
            }
        }

        for (const element of possibleLabels) {
            const text = normalizeText(element.textContent);

            if (text === 'online') {
                return true;
            }
        }

        /*
         * Unknown status is treated as NOT online.
         *
         * This is intentionally conservative because the main use case is
         * selecting machines before a bulk script deployment.
         */
        return false;
    }

    function getAssetCheckbox(row) {
        return (
            row.querySelector('input.selectedId[type="checkbox"]') ||
            row.querySelector('input.selectedId') ||
            row.querySelector('input[type="checkbox"][value]')
        );
    }

    function isRowVisibleBySyncro(row) {
        if (!row) {
            return false;
        }

        /*
         * Online rows are never hidden by our own filter, so a normal
         * visibility check tells us whether Syncro itself currently has
         * this row visible because of search/filter/pagination.
         */
        return (
            row.getClientRects().length > 0 &&
            window.getComputedStyle(row).display !== 'none'
        );
    }

    function setCheckboxState(checkbox, shouldBeChecked) {
        if (!checkbox || checkbox.disabled) {
            return;
        }

        if (checkbox.checked === shouldBeChecked) {
            return;
        }

        /*
         * Use click() rather than changing .checked directly so Syncro's
         * own checkbox event handlers and bulk-action controls update.
         */
        checkbox.click();
    }

    function selectOnlineAssets() {
        const rows = getAssetRows();

        rows.forEach(row => {
            if (!isRowVisibleBySyncro(row)) {
                return;
            }

            const checkbox = getAssetCheckbox(row);

            if (!checkbox) {
                return;
            }

            const online = isAssetOnline(row);

            /*
             * This intentionally deselects visible offline assets.
             * It helps prevent accidentally including an offline device
             * in a bulk script deployment.
             */
            setCheckboxState(checkbox, online);
        });

        scheduleUpdate();
    }

    function applyOnlineFilter() {
        const rows = getAssetRows();

        rows.forEach(row => {
            const online = isAssetOnline(row);

            row.dataset.tnsOnline = online ? 'true' : 'false';

            if (onlineOnlyEnabled && !online) {
                row.classList.add(FILTER_HIDDEN_CLASS);
            } else {
                row.classList.remove(FILTER_HIDDEN_CLASS);
            }
        });
    }

    function updateCounter() {
        const counter = document.querySelector(
            `#${TOOLBAR_ID} [data-tns-online-count]`
        );

        if (!counter) {
            return;
        }

        const rows = getAssetRows();
        const total = rows.length;
        const online = rows.filter(isAssetOnline).length;

        counter.textContent = `🟢 ${online} Online / ${total} Total`;
    }

    function updateOnlineOnlyButton() {
        const button = document.querySelector(
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
            onlineOnlyEnabled ? 'true' : 'false'
        );

        button.textContent = onlineOnlyEnabled
            ? '✓ Online Only'
            : 'Online Only';
    }

    function toggleOnlineOnly() {
        onlineOnlyEnabled = !onlineOnlyEnabled;

        applyOnlineFilter();
        updateOnlineOnlyButton();
        updateCounter();
    }

    function addStyles() {
        if (document.getElementById('tns-online-assets-style')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'tns-online-assets-style';

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

        document.head.appendChild(style);
    }

    function findToolbarInsertionPoint(table) {
        if (!table) {
            return null;
        }

        /*
         * Prefer putting the controls inside the DataTables wrapper when
         * present so they visually belong to Syncro's asset table.
         */
        const wrapper = table.closest(
            '.dataTables_wrapper, [data-testid="assets-table-wrapper"]'
        );

        if (wrapper) {
            const topRow =
                wrapper.querySelector('.row:first-child') ||
                wrapper.firstElementChild;

            if (topRow && topRow !== table) {
                return {
                    parent: topRow.parentElement,
                    before: topRow.nextSibling
                };
            }

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
        if (document.getElementById(TOOLBAR_ID)) {
            return;
        }

        const table = getAssetsTable();

        if (!table) {
            return;
        }

        const insertionPoint = findToolbarInsertionPoint(table);

        if (!insertionPoint?.parent) {
            return;
        }

        const toolbar = document.createElement('div');
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
                    title="Show only assets currently detected as online"
                >
                    Online Only
                </button>

                <button
                    type="button"
                    class="btn btn-default btn-sm"
                    data-tns-select-online
                    title="Select all currently visible online assets and deselect visible offline assets"
                >
                    Select Online
                </button>
            </span>
        `;

        toolbar
            .querySelector('[data-tns-online-only]')
            .addEventListener('click', toggleOnlineOnly);

        toolbar
            .querySelector('[data-tns-select-online]')
            .addEventListener('click', selectOnlineAssets);

        insertionPoint.parent.insertBefore(
            toolbar,
            insertionPoint.before
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

    scheduleUpdate();

    window.addEventListener(
        'load',
        scheduleUpdate
    );

    const observer = new MutationObserver(() => {
        scheduleUpdate();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
