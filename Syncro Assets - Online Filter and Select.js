// ==UserScript==
// @name         Syncro Assets - Online Filter and Select
// @namespace    https://texomans.com/
// @version      1.0.3
// @description  Shows online asset counts and adds Online Only/Show All plus Select/Deselect Online controls to the Syncro Assets page.
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
        const table = getAssetsTable();
        const statusColumnIndex =
            getStatusColumnIndex(table);

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

                const text =
                    normalizeText(
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

        const rowResult =
            inspectElementForStatus(row);

        if (rowResult !== null) {
            return rowResult;
        }

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

    function getOnlineRows() {
        return getAssetRows().filter(
            isAssetOnline
        );
    }

    function getOnlineSelectionState() {
        const onlineRows =
            getOnlineRows();

        if (!onlineRows.length) {
            return {
                total: 0,
                selected: 0,
                allSelected: false
            };
        }

        const selected =
            onlineRows.filter(row => {
                const checkbox =
                    getAssetCheckbox(row);

                return !!checkbox?.checked;
            }).length;

        return {
            total: onlineRows.length,
            selected,
            allSelected:
                selected === onlineRows.length
        };
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
         * Use Syncro's real checkbox click handler so its native
         * bulk-action system knows about the selection change.
         */
        checkbox.click();
    }

    function toggleOnlineSelection(event) {
        event?.preventDefault();
        event?.stopPropagation();

        const state =
            getOnlineSelectionState();

        if (!state.total) {
            return;
        }

        /*
         * If all online assets are currently selected,
         * deselect them.
         *
         * Otherwise select all online assets.
         *
         * Offline asset selections are deliberately left alone.
         */
        const shouldSelect =
            !state.allSelected;

        getOnlineRows().forEach(row => {
            const checkbox =
                getAssetCheckbox(row);

            setCheckboxState(
                checkbox,
                shouldSelect
            );
        });

        updateSelectionButton();
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

    function toggleOnlineOnly(event) {
        event?.preventDefault();
        event?.stopPropagation();

        onlineOnlyEnabled =
            !onlineOnlyEnabled;

        applyOnlineFilter();
        updateFilterButton();
        updateCounter();
    }

    function updateCounter() {
        const counter =
            document.querySelector(
                `#${TOOLBAR_ID} [data-tns-online-count]`
            );

        if (!counter) {
            return;
        }

        const rows =
            getAssetRows();

        const online =
            rows.filter(
                isAssetOnline
            ).length;

        const newText =
            `🟢 ${online} Online / ${rows.length} Total`;

        if (
            counter.textContent !==
            newText
        ) {
            counter.textContent =
                newText;
        }
    }

    function updateFilterButton() {
        const button =
            document.querySelector(
                `#${TOOLBAR_ID} [data-tns-online-only]`
            );

        if (!button) {
            return;
        }

        if (onlineOnlyEnabled) {
            button.textContent =
                'Show All';

            button.classList.remove(
                'btn-default'
            );

            button.classList.add(
                'btn-success'
            );

            button.title =
                'Show all assets';
        } else {
            button.textContent =
                'Online Only';

            button.classList.remove(
                'btn-success'
            );

            button.classList.add(
                'btn-default'
            );

            button.title =
                'Show only online assets';
        }

        button.setAttribute(
            'aria-pressed',
            onlineOnlyEnabled
                ? 'true'
                : 'false'
        );
    }

    function updateSelectionButton() {
        const button =
            document.querySelector(
                `#${TOOLBAR_ID} [data-tns-select-online]`
            );

        if (!button) {
            return;
        }

        const state =
            getOnlineSelectionState();

        button.disabled =
            state.total === 0;

        if (state.allSelected) {
            button.textContent =
                'Deselect Online';

            button.classList.remove(
                'btn-default'
            );

            button.classList.add(
                'btn-warning'
            );

            button.title =
                'Deselect all online assets';
        } else {
            button.textContent =
                'Select Online';

            button.classList.remove(
                'btn-warning'
            );

            button.classList.add(
                'btn-default'
            );

            button.title =
                'Select all online assets';
        }
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

        style.id =
            STYLE_ID;

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

        const toolbar =
            document.createElement(
                'div'
            );

        toolbar.id =
            TOOLBAR_ID;

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
                >
                    Online Only
                </button>

                <button
                    type="button"
                    class="btn btn-default btn-sm"
                    data-tns-select-online
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
                toggleOnlineSelection
            );

        const wrapper =
            table.closest(
                '.dataTables_wrapper, [data-testid="assets-table-wrapper"]'
            );

        if (wrapper) {
            wrapper.insertBefore(
                toolbar,
                table
            );
        } else {
            table.parentElement?.insertBefore(
                toolbar,
                table
            );
        }
    }

    function update() {
        if (!isAssetsIndexPage()) {
            return;
        }

        addStyles();
        createToolbar();

        applyOnlineFilter();
        updateCounter();
        updateFilterButton();
        updateSelectionButton();
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

        if (
            target instanceof Text &&
            target.parentElement?.closest(
                `#${TOOLBAR_ID}`
            )
        ) {
            return true;
        }

        return false;
    }

    const observer =
        new MutationObserver(
            mutations => {
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

    /*
     * Keep Select/Deselect Online synchronized if the user manually
     * changes asset checkboxes or uses Syncro's own selection controls.
     */
    document.addEventListener(
        'change',
        event => {
            const target =
                event.target;

            if (
                target instanceof HTMLInputElement &&
                target.type === 'checkbox' &&
                (
                    target.classList.contains(
                        'selectedId'
                    ) ||
                    target.closest(
                        'table[data-testid="assets-table"]'
                    )
                )
            ) {
                window.setTimeout(
                    updateSelectionButton,
                    0
                );
            }
        },
        true
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
