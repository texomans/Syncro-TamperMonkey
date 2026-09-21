// ==UserScript==
// @name         Syncro Assets - Online Filter and Select
// @namespace    https://texomans.com/
// @version      1.0.5
// @description  Adds stable Online Only/Show All and Select/Deselect Online controls to the Syncro Assets page.
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

    let onlineOnlyEnabled = false;

    function normalizeText(value) {
        return (value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
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

    function getStatusColumnIndex() {
        const table = getAssetsTable();

        if (!table) {
            return -1;
        }

        const headers = Array.from(
            table.querySelectorAll('thead th')
        );

        const statusTerms = [
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

            return statusTerms.some(term =>
                text === term ||
                text.includes(term)
            );
        });
    }

    function getStatusValues(element) {
        if (!element) {
            return [];
        }

        return [
            element.getAttribute('title'),
            element.getAttribute('aria-label'),
            element.getAttribute('data-original-title'),
            element.getAttribute('data-status'),
            element.getAttribute('data-state'),
            element.getAttribute('data-online')
        ]
            .filter(Boolean)
            .map(normalizeText);
    }

    function getClassText(element) {
        if (
            !element ||
            typeof element.className !== 'string'
        ) {
            return '';
        }

        return normalizeText(
            element.className
        );
    }

    function indicatesOffline(element) {
        const values =
            getStatusValues(element);

        if (
            values.some(value =>
                value === 'offline' ||
                value === 'false' ||
                value.includes('currently offline') ||
                value.includes('agent offline') ||
                value.includes('device offline')
            )
        ) {
            return true;
        }

        const classes =
            getClassText(element);

        return (
            /\bstatus-offline\b/.test(classes) ||
            /\basset-offline\b/.test(classes) ||
            /\bis-offline\b/.test(classes) ||
            /\boffline\b/.test(classes)
        );
    }

    function indicatesOnline(element) {
        const values =
            getStatusValues(element);

        if (
            values.some(value =>
                value === 'online' ||
                value === 'true' ||
                value.includes('currently online') ||
                value.includes('agent online') ||
                value.includes('device online')
            )
        ) {
            return true;
        }

        const classes =
            getClassText(element);

        if (
            /\bstatus-online\b/.test(classes) ||
            /\basset-online\b/.test(classes) ||
            /\bis-online\b/.test(classes) ||
            /\bonline\b/.test(classes)
        ) {
            return true;
        }

        if (
            classes.includes('text-success') &&
            (
                classes.includes('circle') ||
                classes.includes('status') ||
                element.tagName === 'I'
            )
        ) {
            return true;
        }

        return false;
    }

    function inspectStatus(root) {
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
         * Check OFFLINE first.
         *
         * This avoids false positives from things such
         * as "Last Online".
         */
        for (const element of elements) {
            if (indicatesOffline(element)) {
                return false;
            }
        }

        for (const element of elements) {
            if (indicatesOnline(element)) {
                return true;
            }
        }

        return null;
    }

    function isAssetOnline(row) {
        const statusIndex =
            getStatusColumnIndex();

        /*
         * First preference: the actual Status column.
         */
        if (statusIndex >= 0) {
            const cells =
                row.querySelectorAll('td');

            const statusCell =
                cells[statusIndex];

            if (statusCell) {
                const result =
                    inspectStatus(statusCell);

                if (result !== null) {
                    return result;
                }

                const text =
                    normalizeText(
                        statusCell.textContent
                    );

                if (text === 'online') {
                    return true;
                }

                if (text === 'offline') {
                    return false;
                }
            }
        }

        /*
         * Second preference:
         * explicit status information elsewhere in the row.
         */
        const rowResult =
            inspectStatus(row);

        if (rowResult !== null) {
            return rowResult;
        }

        /*
         * Last-resort text check.
         */
        const labels =
            row.querySelectorAll(
                'span, small, strong, i'
            );

        for (const element of labels) {
            if (
                normalizeText(
                    element.textContent
                ) === 'offline'
            ) {
                return false;
            }
        }

        for (const element of labels) {
            if (
                normalizeText(
                    element.textContent
                ) === 'online'
            ) {
                return true;
            }
        }

        /*
         * Unknown status is considered NOT online.
         *
         * Better to omit a machine from a bulk script than
         * incorrectly assume that it is online.
         */
        return false;
    }

    function getOnlineRows() {
        return getAssetRows().filter(
            isAssetOnline
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
         * Click the real Syncro checkbox so its own bulk
         * selection system sees the change.
         */
        checkbox.click();
    }

    function getSelectionState() {
        const onlineRows =
            getOnlineRows();

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
                onlineRows.length > 0 &&
                selected === onlineRows.length
        };
    }

    function updateCounter() {
        const counter =
            document.querySelector(
                `#${TOOLBAR_ID} [data-tns-count]`
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

        counter.textContent =
            `🟢 ${online} Online / ${rows.length} Total`;
    }

    function updateFilterButton() {
        const button =
            document.querySelector(
                `#${TOOLBAR_ID} [data-tns-filter]`
            );

        if (!button) {
            return;
        }

        if (onlineOnlyEnabled) {
            button.textContent =
                'Show All';

            button.title =
                'Show all assets';

            button.classList.remove(
                'btn-default'
            );

            button.classList.add(
                'btn-success'
            );
        } else {
            button.textContent =
                'Online Only';

            button.title =
                'Show only online assets';

            button.classList.remove(
                'btn-success'
            );

            button.classList.add(
                'btn-default'
            );
        }
    }

    function updateSelectionButton() {
        const button =
            document.querySelector(
                `#${TOOLBAR_ID} [data-tns-selection]`
            );

        if (!button) {
            return;
        }

        const state =
            getSelectionState();

        button.disabled =
            state.total === 0;

        if (state.allSelected) {
            button.textContent =
                'Deselect Online';

            button.title =
                'Deselect all online assets';

            button.classList.remove(
                'btn-default'
            );

            button.classList.add(
                'btn-warning'
            );
        } else {
            button.textContent =
                'Select Online';

            button.title =
                'Select all online assets';

            button.classList.remove(
                'btn-warning'
            );

            button.classList.add(
                'btn-default'
            );
        }
    }

    function showOnlineOnly() {
        /*
         * Take ONE snapshot of online state.
         *
         * There is no observer and no continuous evaluation.
         */
        getAssetRows().forEach(row => {
            const online =
                isAssetOnline(row);

            /*
             * Save whatever inline display value Syncro had before
             * we touched the row.
             */
            if (
                row.dataset.tnsOriginalDisplay ===
                undefined
            ) {
                row.dataset.tnsOriginalDisplay =
                    row.style.display || '';
            }

            if (online) {
                row.style.display =
                    row.dataset.tnsOriginalDisplay;
            } else {
                row.style.display =
                    'none';
            }
        });

        onlineOnlyEnabled = true;

        updateFilterButton();
    }

    function showAllAssets() {
        getAssetRows().forEach(row => {
            row.style.display =
                row.dataset.tnsOriginalDisplay ||
                '';

            delete row.dataset
                .tnsOriginalDisplay;
        });

        onlineOnlyEnabled = false;

        updateFilterButton();
    }

    function handleFilterClick(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        if (onlineOnlyEnabled) {
            showAllAssets();
        } else {
            showOnlineOnly();
        }
    }

    function handleSelectionClick(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const state =
            getSelectionState();

        if (!state.total) {
            return;
        }

        /*
         * All selected:
         *     deselect online assets.
         *
         * Anything else:
         *     select online assets.
         */
        const shouldSelect =
            !state.allSelected;

        getOnlineRows().forEach(row => {
            setCheckboxState(
                getAssetCheckbox(row),
                shouldSelect
            );
        });

        updateSelectionButton();
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
                data-tns-count
            >
                🟢 0 Online / 0 Total
            </span>

            <span class="tns-online-actions">

                <button
                    type="button"
                    class="btn btn-default btn-sm"
                    data-tns-filter
                    title="Show only online assets"
                >
                    Online Only
                </button>

                <button
                    type="button"
                    class="btn btn-default btn-sm"
                    data-tns-selection
                    title="Select all online assets"
                >
                    Select Online
                </button>

            </span>
        `;

        toolbar
            .querySelector(
                '[data-tns-filter]'
            )
            .addEventListener(
                'click',
                handleFilterClick,
                true
            );

        toolbar
            .querySelector(
                '[data-tns-selection]'
            )
            .addEventListener(
                'click',
                handleSelectionClick,
                true
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
            table.parentElement
                ?.insertBefore(
                    toolbar,
                    table
                );
        }
    }

    function initialize() {
        const table =
            getAssetsTable();

        if (!table) {
            /*
             * Syncro sometimes builds the table shortly after
             * document-idle. Retry initialization only.
             *
             * This DOES NOT watch or filter the table after startup.
             */
            window.setTimeout(
                initialize,
                500
            );

            return;
        }

        addStyles();
        createToolbar();

        updateCounter();
        updateFilterButton();
        updateSelectionButton();
    }

    /*
     * Only keep the Select/Deselect label synchronized
     * when a real checkbox changes.
     *
     * This has nothing to do with Online Only.
     */
    document.addEventListener(
        'change',
        event => {
            const target =
                event.target;

            if (
                target instanceof HTMLInputElement &&
                target.type === 'checkbox' &&
                target.closest(
                    'table[data-testid="assets-table"]'
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

    initialize();
})();
