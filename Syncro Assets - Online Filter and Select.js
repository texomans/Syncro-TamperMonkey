// ==UserScript==
// @name         Syncro Assets - Online Filter and Select
// @namespace    https://texomans.com/
// @version      1.1.3
// @description  Live online asset counter with Online Only/Show All and Select/Deselect Online controls.
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

    /*
     * Do NOT put the word "online" in this class name.
     *
     * Our status detector recognizes "online" in certain
     * Syncro classes, so our own filtering class must not
     * accidentally look like an online status.
     */
    const FILTER_HIDDEN_CLASS = 'tns-filter-hidden';

    /*
     * Cleanup from earlier versions.
     */
    const OLD_FILTER_HIDDEN_CLASS = 'tns-online-filter-hidden';

    /*
     * Live refresh interval.
     *
     * Once per second should be responsive without doing
     * unnecessary DOM work several times per second.
     */
    const POLL_INTERVAL_MS = 1000;

    let onlineOnlyEnabled = false;

    /*
     * ------------------------------------------------------------
     * TABLE HELPERS
     * ------------------------------------------------------------
     */

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
        ).filter(row => {
            return !!row.querySelector(
                'input.selectedId, input[type="checkbox"][value]'
            );
        });
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

    function normalizeText(value) {
        return (value || '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /*
     * ------------------------------------------------------------
     * ONLINE DETECTION
     * ------------------------------------------------------------
     *
     * This preserves the broad detection method from the original
     * version that successfully detected your online assets.
     * ------------------------------------------------------------
     */

    function getStatusColumnIndex(table) {
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

        /*
         * Syncro's known green online circle.
         */
        if (
            element.tagName === 'I' &&
            classText.includes('fa-circle')
        ) {
            const style =
                window.getComputedStyle(
                    element
                );

            const color =
                style.color ||
                element.style.color ||
                '';

            if (
                color.includes('42, 186, 138') ||
                color.includes('rgb(42, 186, 138)')
            ) {
                return true;
            }
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

        return (
            /\bstatus-offline\b/.test(classText) ||
            /\basset-offline\b/.test(classText) ||
            /\bis-offline\b/.test(classText) ||
            /\boffline\b/.test(classText)
        );
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
                    '.text-success',
                    '.fa-circle'
                ].join(',')
            )
        ];

        /*
         * Explicit Offline information wins first.
         */
        for (const element of elements) {
            if (
                elementIndicatesOffline(
                    element
                )
            ) {
                return false;
            }
        }

        for (const element of elements) {
            if (
                elementIndicatesOnline(
                    element
                )
            ) {
                return true;
            }
        }

        return null;
    }

    function isAssetOnline(row) {
        /*
         * Remove obsolete filtering class from older script versions.
         *
         * The old class included the word "online", so leaving it
         * attached could create a false positive.
         */
        row.classList.remove(
            OLD_FILTER_HIDDEN_CLASS
        );

        const table =
            getAssetsTable();

        const statusColumnIndex =
            getStatusColumnIndex(
                table
            );

        /*
         * Prefer a dedicated status column if Syncro exposes one.
         */
        if (statusColumnIndex >= 0) {
            const cells =
                row.querySelectorAll('td');

            const statusCell =
                cells[statusColumnIndex];

            if (statusCell) {
                const status =
                    inspectElementForStatus(
                        statusCell
                    );

                if (status !== null) {
                    return status;
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
         * Known-good original behavior:
         * inspect the entire asset row.
         */
        const rowStatus =
            inspectElementForStatus(
                row
            );

        if (rowStatus !== null) {
            return rowStatus;
        }

        /*
         * Conservative fallback.
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

        return false;
    }

    function getOnlineRows() {
        return getAssetRows().filter(
            isAssetOnline
        );
    }

    /*
     * ------------------------------------------------------------
     * COUNTER
     * ------------------------------------------------------------
     */

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

        counter.textContent =
            `🟢 ${online} Online / ${rows.length} Total`;
    }

    /*
     * ------------------------------------------------------------
     * ONLINE ONLY / SHOW ALL
     * ------------------------------------------------------------
     */

    function applyOnlineFilter() {
        if (!onlineOnlyEnabled) {
            return;
        }

        /*
         * Reevaluate every row.
         *
         * This allows:
         *
         *   offline -> online = automatically appears
         *   online  -> offline = automatically disappears
         */
        getAssetRows().forEach(row => {
            const online =
                isAssetOnline(row);

            row.classList.toggle(
                FILTER_HIDDEN_CLASS,
                !online
            );
        });
    }

    function clearOnlineFilter() {
        getAssetRows().forEach(row => {
            row.classList.remove(
                FILTER_HIDDEN_CLASS
            );

            row.classList.remove(
                OLD_FILTER_HIDDEN_CLASS
            );
        });
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

    function handleFilterClick(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        onlineOnlyEnabled =
            !onlineOnlyEnabled;

        if (onlineOnlyEnabled) {
            applyOnlineFilter();
        } else {
            clearOnlineFilter();
        }

        updateFilterButton();
        updateCounter();
        updateSelectionButton();
    }

    /*
     * ------------------------------------------------------------
     * SELECT ONLINE / DESELECT ONLINE
     * ------------------------------------------------------------
     */

    function getOnlineSelectionState() {
        const onlineRows =
            getOnlineRows();

        const selected =
            onlineRows.filter(row => {
                const checkbox =
                    getAssetCheckbox(row);

                return !!checkbox?.checked;
            }).length;

        return {
            total:
                onlineRows.length,

            selected,

            allSelected:
                onlineRows.length > 0 &&
                selected === onlineRows.length
        };
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
         * Click Syncro's actual checkbox so its own Bulk Actions
         * logic receives the normal change event.
         */
        checkbox.click();
    }

    function handleSelectionClick(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        const state =
            getOnlineSelectionState();

        if (!state.total) {
            return;
        }

        /*
         * If every online machine is selected:
         *     deselect them.
         *
         * Otherwise:
         *     select all current online machines.
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

    /*
     * ------------------------------------------------------------
     * STYLING
     * ------------------------------------------------------------
     */

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

    /*
     * ------------------------------------------------------------
     * TOOLBAR
     * ------------------------------------------------------------
     */

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
                    title="Show only online assets"
                >
                    Online Only
                </button>

                <button
                    type="button"
                    class="btn btn-default btn-sm"
                    data-tns-select-online
                    title="Select all online assets"
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
                handleFilterClick,
                true
            );

        toolbar
            .querySelector(
                '[data-tns-select-online]'
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

    /*
     * ------------------------------------------------------------
     * LIVE REFRESH
     * ------------------------------------------------------------
     *
     * Runs once every second for as long as this page is open.
     *
     * It may:
     *
     *   - update Online / Total
     *   - update the live Online Only filter
     *   - update Select/Deselect Online button text
     *   - recreate our toolbar if Syncro replaces part of the page
     *
     * It NEVER:
     *
     *   - toggles Online Only by itself
     *   - selects an asset by itself
     *   - deselects an asset by itself
     * ------------------------------------------------------------
     */

    function refreshLiveState() {
        const table =
            getAssetsTable();

        if (!table) {
            return;
        }

        addStyles();
        createToolbar();

        /*
         * Clean up obsolete filtering class from older versions.
         */
        getAssetRows().forEach(row => {
            row.classList.remove(
                OLD_FILTER_HIDDEN_CLASS
            );
        });

        /*
         * If Online Only is active, continually reapply the filter
         * against Syncro's current status indicators.
         */
        if (onlineOnlyEnabled) {
            applyOnlineFilter();
        }

        updateCounter();
        updateFilterButton();
        updateSelectionButton();
    }

    /*
     * Keep the Select/Deselect label responsive immediately when
     * the user manually changes a checkbox instead of waiting up
     * to one second for the next poll.
     */
    document.addEventListener(
        'change',
        event => {
            const target =
                event.target;

            if (
                target instanceof HTMLInputElement &&
                target.classList.contains(
                    'selectedId'
                ) &&
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

    /*
     * Initial run.
     */
    refreshLiveState();

    /*
     * Permanent live polling.
     *
     * No MutationObserver.
     * No feedback loop.
     */
    window.setInterval(
        refreshLiveState,
        POLL_INTERVAL_MS
    );

})();
