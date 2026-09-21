// ==UserScript==
// @name         Syncro Assets - Online Filter and Select
// @namespace    https://texomans.com/
// @version      1.0.7
// @description  Shows online asset counts and adds Online Only/Show All and Select/Deselect Online controls to Syncro Assets.
// @match        https://*.syncromsp.com/customer_assets*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Online%20Filter%20and%20Select.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Online%20Filter%20and%20Select.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const INSTANCE_KEY =
        '__TNS_SYNCRO_ASSETS_ONLINE_FILTER_107__';

    if (window[INSTANCE_KEY]) {
        return;
    }

    window[INSTANCE_KEY] = true;

    const TOOLBAR_ID =
        'tns-online-assets-toolbar';

    const STYLE_ID =
        'tns-online-assets-style';

    const HIDDEN_CLASS =
        'tns-online-assets-hidden';

    let onlineOnlyEnabled = false;

    /*
     * ------------------------------------------------------------
     * Syncro table helpers
     * ------------------------------------------------------------
     */

    function getAssetsTable() {
        return document.querySelector(
            'table[data-testid="assets-table"]'
        );
    }

    function getAssetRows() {
        const table =
            getAssetsTable();

        if (!table) {
            return [];
        }

        return Array.from(
            table.querySelectorAll(
                'tbody tr[data-testid^="asset-row-"], tbody tr'
            )
        ).filter(row =>
            !!row.querySelector(
                'input.selectedId'
            )
        );
    }

    function getAssetCheckbox(row) {
        return row.querySelector(
            'input.selectedId'
        );
    }

    /*
     * ------------------------------------------------------------
     * Exact Syncro Online/Offline detection
     * ------------------------------------------------------------
     *
     * Syncro renders asset status as:
     *
     * <span
     *   data-sidepack-react-class="legacy/asset/AssetStatus"
     * >
     *     <span class="tooltipper"
     *           data-original-title="Online">
     *         ...
     *     </span>
     * </span>
     *
     * Offline uses:
     *
     * data-original-title="Offline – Last Synced: ..."
     *
     * We use that exact status component.
     * ------------------------------------------------------------
     */

    function getAssetStatus(row) {
        const statusComponent =
            row.querySelector(
                '[data-sidepack-react-class="legacy/asset/AssetStatus"]'
            );

        if (!statusComponent) {
            return 'unknown';
        }

        const tooltip =
            statusComponent.querySelector(
                '.tooltipper[data-original-title]'
            );

        if (!tooltip) {
            return 'unknown';
        }

        const statusText =
            (
                tooltip.getAttribute(
                    'data-original-title'
                ) || ''
            )
                .trim()
                .toLowerCase();

        if (
            statusText === 'online' ||
            statusText.startsWith(
                'online '
            )
        ) {
            return 'online';
        }

        if (
            statusText === 'offline' ||
            statusText.startsWith(
                'offline '
            ) ||
            statusText.startsWith(
                'offline –'
            ) ||
            statusText.startsWith(
                'offline -'
            )
        ) {
            return 'offline';
        }

        return 'unknown';
    }

    function isAssetOnline(row) {
        return (
            getAssetStatus(row) ===
            'online'
        );
    }

    function getOnlineRows() {
        return getAssetRows().filter(
            isAssetOnline
        );
    }

    /*
     * ------------------------------------------------------------
     * Counter
     * ------------------------------------------------------------
     */

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

    /*
     * ------------------------------------------------------------
     * Online Only / Show All
     * ------------------------------------------------------------
     */

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

    function showOnlineOnly() {
        getAssetRows().forEach(row => {
            row.classList.toggle(
                HIDDEN_CLASS,
                !isAssetOnline(row)
            );
        });

        onlineOnlyEnabled = true;

        updateFilterButton();
    }

    function showAllAssets() {
        getAssetRows().forEach(row => {
            row.classList.remove(
                HIDDEN_CLASS
            );
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
            /*
             * Take a fresh snapshot immediately before filtering.
             */
            updateCounter();
            showOnlineOnly();
        }
    }

    /*
     * ------------------------------------------------------------
     * Select Online / Deselect Online
     * ------------------------------------------------------------
     */

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
            selected: selected,
            allSelected:
                rows.length > 0 &&
                selected === rows.length
        };
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
         * Use Syncro's actual checkbox click handler so its
         * built-in bulk action controls update correctly.
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
         * If every online asset is selected:
         *     deselect online assets.
         *
         * Otherwise:
         *     select all online assets.
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

    /*
     * ------------------------------------------------------------
     * Styles
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
            tr.${HIDDEN_CLASS} {
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
     * Toolbar
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

    /*
     * ------------------------------------------------------------
     * Initialization
     * ------------------------------------------------------------
     *
     * No MutationObserver.
     * No recurring interval.
     *
     * We retry only until Syncro has finished rendering the
     * asset rows, then initialization stops.
     * ------------------------------------------------------------
     */

    let attempts = 0;

    function initialize() {
        const table =
            getAssetsTable();

        const rows =
            getAssetRows();

        /*
         * We also make sure Syncro has rendered at least one
         * AssetStatus component before calculating the counter.
         */
        const statusRendered =
            !!document.querySelector(
                '[data-sidepack-react-class="legacy/asset/AssetStatus"]'
            );

        if (
            !table ||
            rows.length === 0 ||
            !statusRendered
        ) {
            attempts++;

            if (attempts < 40) {
                window.setTimeout(
                    initialize,
                    250
                );
            }

            return;
        }

        addStyles();
        createToolbar();

        updateCounter();
        updateFilterButton();
        updateSelectionButton();
    }

    /*
     * Keep Select/Deselect Online synchronized if you manually
     * select/deselect assets using Syncro's checkboxes.
     *
     * This listener DOES NOT touch the Online Only filter.
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

    initialize();
})();
