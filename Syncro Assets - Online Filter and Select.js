// ==UserScript==
// @name         Syncro Assets - Online Filter and Select
// @namespace    https://texomans.com/
// @version      1.0.4
// @description  Shows online asset counts with Online Only/Show All and Select/Deselect Online controls.
// @match        https://*.syncromsp.com/customer_assets*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Online%20Filter%20and%20Select.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Online%20Filter%20and%20Select.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    /*
     * v1.0.4
     *
     * Important design change:
     * The Online Only state can ONLY change from an actual user click.
     * MutationObservers may refresh the UI, but they never toggle state.
     */

    const INSTANCE_KEY =
        '__TNS_SYNCRO_ASSETS_ONLINE_FILTER_V104__';

    if (window[INSTANCE_KEY]) {
        return;
    }

    window[INSTANCE_KEY] = true;

    const TOOLBAR_ID =
        'tns-online-assets-toolbar-v104';

    const STYLE_ID =
        'tns-online-assets-style-v104';

    const FILTER_CLASS =
        'tns-online-filter-hidden-v104';

    /*
     * IDs/classes used by previous versions.
     *
     * We neutralize them so an older running instance cannot fight
     * with this version over the rows or buttons.
     */
    const LEGACY_TOOLBAR_ID =
        'tns-online-assets-toolbar';

    const LEGACY_FILTER_CLASS =
        'tns-online-filter-hidden';

    let onlineOnlyEnabled = false;
    let updatePending = false;

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

    function isAssetsPage() {
        return (
            document.body?.dataset?.currentPage ===
                'assets-index' ||
            !!getAssetsTable()
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

        const terms = [
            'status',
            'online',
            'agent status',
            'rmm status',
            'syncro status'
        ];

        return headers.findIndex(header => {
            const text =
                normalizeText(
                    header.textContent
                );

            return terms.some(term =>
                text === term ||
                text.includes(term)
            );
        });
    }

    function getElementClassText(element) {
        if (!element) {
            return '';
        }

        if (
            typeof element.className ===
            'string'
        ) {
            return normalizeText(
                element.className
            );
        }

        return '';
    }

    function getStatusAttributes(element) {
        if (!element) {
            return [];
        }

        return [
            element.getAttribute('title'),
            element.getAttribute(
                'aria-label'
            ),
            element.getAttribute(
                'data-original-title'
            ),
            element.getAttribute(
                'data-status'
            ),
            element.getAttribute(
                'data-state'
            ),
            element.getAttribute(
                'data-online'
            )
        ]
            .filter(Boolean)
            .map(normalizeText);
    }

    function indicatesOffline(element) {
        const values =
            getStatusAttributes(element);

        if (
            values.some(value =>
                value === 'offline' ||
                value === 'false' ||
                value.includes(
                    'currently offline'
                ) ||
                value.includes(
                    'agent offline'
                ) ||
                value.includes(
                    'device offline'
                )
            )
        ) {
            return true;
        }

        const classes =
            getElementClassText(element);

        return (
            /\bstatus-offline\b/.test(
                classes
            ) ||
            /\basset-offline\b/.test(
                classes
            ) ||
            /\bis-offline\b/.test(
                classes
            ) ||
            /\boffline\b/.test(
                classes
            )
        );
    }

    function indicatesOnline(element) {
        const values =
            getStatusAttributes(element);

        if (
            values.some(value =>
                value === 'online' ||
                value === 'true' ||
                value.includes(
                    'currently online'
                ) ||
                value.includes(
                    'agent online'
                ) ||
                value.includes(
                    'device online'
                )
            )
        ) {
            return true;
        }

        const classes =
            getElementClassText(element);

        if (
            /\bstatus-online\b/.test(
                classes
            ) ||
            /\basset-online\b/.test(
                classes
            ) ||
            /\bis-online\b/.test(
                classes
            ) ||
            /\bonline\b/.test(
                classes
            )
        ) {
            return true;
        }

        if (
            classes.includes(
                'text-success'
            ) &&
            (
                classes.includes(
                    'circle'
                ) ||
                classes.includes(
                    'status'
                ) ||
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
         * Offline is checked first to prevent things such as
         * "Last Online" from being mistaken for Online.
         */
        for (const element of elements) {
            if (
                indicatesOffline(element)
            ) {
                return false;
            }
        }

        for (const element of elements) {
            if (
                indicatesOnline(element)
            ) {
                return true;
            }
        }

        return null;
    }

    function isAssetOnline(row) {
        const statusColumn =
            getStatusColumnIndex();

        if (statusColumn >= 0) {
            const cells =
                row.querySelectorAll('td');

            const cell =
                cells[statusColumn];

            if (cell) {
                const result =
                    inspectStatus(cell);

                if (result !== null) {
                    return result;
                }

                const text =
                    normalizeText(
                        cell.textContent
                    );

                if (text === 'online') {
                    return true;
                }

                if (text === 'offline') {
                    return false;
                }
            }
        }

        const result =
            inspectStatus(row);

        if (result !== null) {
            return result;
        }

        /*
         * Conservative fallback.
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
         * Unknown status = not online.
         *
         * Safer for bulk script deployments.
         */
        return false;
    }

    function getOnlineRows() {
        return getAssetRows().filter(
            isAssetOnline
        );
    }

    function getOnlineSelectionState() {
        const rows =
            getOnlineRows();

        const selected =
            rows.filter(row => {
                const checkbox =
                    getAssetCheckbox(row);

                return !!checkbox?.checked;
            }).length;

        return {
            total: rows.length,
            selected,
            allSelected:
                rows.length > 0 &&
                selected === rows.length
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
         * Use the real click so Syncro's native
         * bulk-selection logic receives the event.
         */
        checkbox.click();
    }

    function applyFilter() {
        const rows =
            getAssetRows();

        rows.forEach(row => {
            const online =
                isAssetOnline(row);

            row.dataset.tnsOnline =
                online
                    ? 'true'
                    : 'false';

            row.classList.toggle(
                FILTER_CLASS,
                onlineOnlyEnabled &&
                !online
            );
        });
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

        const onlineCount =
            rows.filter(
                isAssetOnline
            ).length;

        const text =
            `🟢 ${onlineCount} Online / ${rows.length} Total`;

        if (
            counter.textContent !==
            text
        ) {
            counter.textContent =
                text;
        }
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

    function refreshUI() {
        if (!isAssetsPage()) {
            return;
        }

        createToolbar();

        /*
         * Re-apply the CURRENT filter state.
         *
         * This function never changes onlineOnlyEnabled.
         */
        applyFilter();
        updateCounter();
        updateFilterButton();
        updateSelectionButton();
    }

    function handleFilterClick(event) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();

        /*
         * THIS is the only place in the entire script
         * where onlineOnlyEnabled changes.
         */
        onlineOnlyEnabled =
            !onlineOnlyEnabled;

        applyFilter();
        updateFilterButton();
        updateCounter();
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

    function neutralizeLegacyVersion() {
        /*
         * If an earlier script instance created its toolbar,
         * remove that toolbar.
         */
        const oldToolbar =
            document.getElementById(
                LEGACY_TOOLBAR_ID
            );

        if (oldToolbar) {
            oldToolbar.remove();
        }

        /*
         * Add an invisible decoy with the old ID.
         *
         * Older running versions see this ID and therefore
         * won't recreate their toolbar.
         */
        if (
            !document.getElementById(
                LEGACY_TOOLBAR_ID
            )
        ) {
            const decoy =
                document.createElement(
                    'div'
                );

            decoy.id =
                LEGACY_TOOLBAR_ID;

            decoy.style.display =
                'none';

            decoy.setAttribute(
                'aria-hidden',
                'true'
            );

            document.body.appendChild(
                decoy
            );
        }

        /*
         * Remove old filtering from every asset row.
         */
        document
            .querySelectorAll(
                `.${LEGACY_FILTER_CLASS}`
            )
            .forEach(row => {
                row.classList.remove(
                    LEGACY_FILTER_CLASS
                );
            });
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
            /*
             * Neutralize filtering from versions <= 1.0.3.
             */
            tr.${LEGACY_FILTER_CLASS} {
                display: table-row !important;
            }

            tr.${FILTER_CLASS} {
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
                data-tns-count
            >
                🟢 0 Online / 0 Total
            </span>

            <span class="tns-online-actions">
                <button
                    type="button"
                    class="btn btn-default btn-sm"
                    data-tns-filter
                >
                    Online Only
                </button>

                <button
                    type="button"
                    class="btn btn-default btn-sm"
                    data-tns-selection
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

    function scheduleRefresh() {
        if (updatePending) {
            return;
        }

        updatePending = true;

        window.setTimeout(() => {
            updatePending = false;

            /*
             * Again: this only REFRESHES.
             * It never toggles filter state.
             */
            refreshUI();
        }, 200);
    }

    addStyles();
    neutralizeLegacyVersion();
    refreshUI();

    /*
     * Watch for Syncro replacing/reloading asset rows.
     *
     * Changes here only cause refreshUI().
     * They cannot toggle Online Only.
     */
    const observer =
        new MutationObserver(
            mutations => {
                const relevant =
                    mutations.some(
                        mutation => {
                            if (
                                mutation.target
                                    instanceof Element
                            ) {
                                if (
                                    mutation.target.closest(
                                        `#${TOOLBAR_ID}`
                                    )
                                ) {
                                    return false;
                                }

                                if (
                                    mutation.target.id ===
                                    LEGACY_TOOLBAR_ID
                                ) {
                                    return false;
                                }
                            }

                            return true;
                        }
                    );

                if (relevant) {
                    scheduleRefresh();
                }
            }
        );

    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );

    /*
     * Update Select/Deselect Online if you manually
     * click one of Syncro's asset checkboxes.
     */
    document.addEventListener(
        'change',
        event => {
            const target =
                event.target;

            if (
                target instanceof
                    HTMLInputElement &&
                target.type ===
                    'checkbox' &&
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

    window.addEventListener(
        'load',
        scheduleRefresh
    );
})();
