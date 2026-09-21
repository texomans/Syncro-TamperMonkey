// ==UserScript==
// @name         Syncro Assets - Online Filter and Select
// @namespace    https://texomans.com/
// @version      1.0.6
// @description  Adds Online Only/Show All and Select/Deselect Online controls to the Syncro Assets page.
// @match        https://*.syncromsp.com/customer_assets*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Online%20Filter%20and%20Select.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Online%20Filter%20and%20Select.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const INSTANCE_KEY =
        '__TNS_SYNCRO_ONLINE_FILTER_106__';

    if (window[INSTANCE_KEY]) {
        return;
    }

    window[INSTANCE_KEY] = true;

    const TOOLBAR_ID =
        'tns-online-assets-toolbar';

    const STYLE_ID =
        'tns-online-assets-style';

    let onlineOnlyEnabled = false;

    /*
     * ------------------------------------------------------------
     * Basic Syncro table helpers
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
        ).filter(row => {
            return !!getAssetCheckbox(row);
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

    function normalize(value) {
        return (value || '')
            .toString()
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();
    }

    /*
     * ------------------------------------------------------------
     * Find the actual Asset Name cell
     * ------------------------------------------------------------
     */

    function getAssetLink(row) {
        const links =
            row.querySelectorAll(
                'a[href*="/customer_assets/"]'
            );

        for (const link of links) {
            try {
                const url =
                    new URL(
                        link.href,
                        window.location.origin
                    );

                if (
                    /^\/customer_assets\/\d+\/?$/.test(
                        url.pathname
                    )
                ) {
                    return link;
                }
            } catch {
                // Ignore malformed links.
            }
        }

        return null;
    }

    function getAssetNameCell(row) {
        const link =
            getAssetLink(row);

        if (!link) {
            return null;
        }

        return (
            link.closest('td') ||
            link.parentElement
        );
    }

    /*
     * ------------------------------------------------------------
     * Color detection
     * ------------------------------------------------------------
     */

    function parseRgb(color) {
        if (!color) {
            return null;
        }

        const match =
            color.match(
                /rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/
            );

        if (!match) {
            return null;
        }

        return {
            r: Number(match[1]),
            g: Number(match[2]),
            b: Number(match[3])
        };
    }

    function isGreenColor(color) {
        const rgb =
            parseRgb(color);

        if (!rgb) {
            return false;
        }

        return (
            rgb.g >= 80 &&
            rgb.g > rgb.r * 1.20 &&
            rgb.g > rgb.b * 1.10
        );
    }

    /*
     * ------------------------------------------------------------
     * Explicit Online / Offline attributes
     * ------------------------------------------------------------
     */

    function getStatusStrings(element) {
        if (!element) {
            return [];
        }

        return [
            element.getAttribute('title'),
            element.getAttribute('aria-label'),
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
            ),
            element.getAttribute(
                'data-testid'
            )
        ]
            .filter(Boolean)
            .map(normalize);
    }

    function explicitStatus(element) {
        const values =
            getStatusStrings(element);

        for (const value of values) {
            if (
                value === 'online' ||
                value === 'true' ||
                value === 'asset online' ||
                value === 'agent online' ||
                value.includes(
                    'currently online'
                )
            ) {
                return true;
            }

            if (
                value === 'offline' ||
                value === 'false' ||
                value === 'asset offline' ||
                value === 'agent offline' ||
                value.includes(
                    'currently offline'
                )
            ) {
                return false;
            }
        }

        return null;
    }

    /*
     * ------------------------------------------------------------
     * React/data-props detection
     *
     * Syncro uses data-react-props/data-props elsewhere on this page.
     * If the online state exists there, use it.
     * ------------------------------------------------------------
     */

    function searchObjectForOnlineState(
        object,
        depth = 0
    ) {
        if (
            !object ||
            typeof object !== 'object' ||
            depth > 8
        ) {
            return null;
        }

        for (
            const [rawKey, value]
            of Object.entries(object)
        ) {
            const key =
                normalize(rawKey)
                    .replace(
                        /[^a-z0-9]/g,
                        ''
                    );

            /*
             * Ignore timestamps/labels such as:
             *
             * last_online
             * last_online_at
             * online_since
             */
            const irrelevant =
                key.includes('lastonline') ||
                key.includes('onlinesince') ||
                key.includes('onlinetime') ||
                key.includes('onlinedate');

            if (!irrelevant) {
                if (
                    key === 'online' ||
                    key === 'isonline' ||
                    key === 'agentonline' ||
                    key === 'assetonline' ||
                    key === 'deviceonline'
                ) {
                    if (
                        typeof value ===
                        'boolean'
                    ) {
                        return value;
                    }

                    const text =
                        normalize(value);

                    if (
                        text === 'true' ||
                        text === 'online'
                    ) {
                        return true;
                    }

                    if (
                        text === 'false' ||
                        text === 'offline'
                    ) {
                        return false;
                    }
                }

                if (
                    key === 'status' ||
                    key === 'presence' ||
                    key === 'presencestatus' ||
                    key === 'connectionstatus'
                ) {
                    const text =
                        normalize(value);

                    if (text === 'online') {
                        return true;
                    }

                    if (text === 'offline') {
                        return false;
                    }
                }
            }

            if (
                value &&
                typeof value === 'object'
            ) {
                const found =
                    searchObjectForOnlineState(
                        value,
                        depth + 1
                    );

                if (found !== null) {
                    return found;
                }
            }
        }

        return null;
    }

    function getOnlineStateFromProps(row) {
        const nodes =
            row.querySelectorAll(
                '[data-react-props], [data-props]'
            );

        for (const node of nodes) {
            const raw =
                node.getAttribute(
                    'data-react-props'
                ) ||
                node.getAttribute(
                    'data-props'
                );

            if (!raw) {
                continue;
            }

            try {
                const props =
                    JSON.parse(raw);

                const result =
                    searchObjectForOnlineState(
                        props
                    );

                if (result !== null) {
                    return result;
                }
            } catch {
                // Ignore malformed JSON.
            }
        }

        return null;
    }

    /*
     * ------------------------------------------------------------
     * Syncro's visible green/empty status dot
     * ------------------------------------------------------------
     */

    function inspectStatusDot(cell) {
        if (!cell) {
            return null;
        }

        const candidates = [
            ...cell.querySelectorAll(
                [
                    'i',
                    'svg',
                    'span',
                    '[title]',
                    '[aria-label]',
                    '[data-status]',
                    '[data-online]'
                ].join(',')
            )
        ];

        /*
         * First use explicit Online / Offline metadata if Syncro
         * provided any.
         */
        for (const element of candidates) {
            const status =
                explicitStatus(element);

            if (status !== null) {
                return status;
            }
        }

        /*
         * Font Awesome 4 style:
         *
         *   fa-circle    = filled
         *   fa-circle-o  = empty
         */
        for (const element of candidates) {
            const classes =
                normalize(
                    typeof element.className ===
                        'string'
                        ? element.className
                        : element.getAttribute(
                              'class'
                          )
                );

            if (
                classes.includes(
                    'fa-circle-o'
                )
            ) {
                return false;
            }
        }

        /*
         * Font Awesome 5/6 outline circle.
         */
        for (const element of candidates) {
            const classes =
                normalize(
                    typeof element.className ===
                        'string'
                        ? element.className
                        : element.getAttribute(
                              'class'
                          )
                );

            if (
                classes.includes(
                    'fa-circle'
                ) &&
                (
                    classes.includes(
                        'far '
                    ) ||
                    classes.includes(
                        'fa-regular'
                    )
                )
            ) {
                return false;
            }
        }

        /*
         * Filled Font Awesome circle.
         */
        for (const element of candidates) {
            const classes =
                normalize(
                    typeof element.className ===
                        'string'
                        ? element.className
                        : element.getAttribute(
                              'class'
                          )
                );

            if (
                classes.includes(
                    'fa-circle'
                ) &&
                !classes.includes(
                    'fa-circle-o'
                )
            ) {
                const style =
                    window.getComputedStyle(
                        element
                    );

                if (
                    classes.includes(
                        'text-success'
                    ) ||
                    isGreenColor(
                        style.color
                    ) ||
                    isGreenColor(
                        style.fill
                    )
                ) {
                    return true;
                }
            }
        }

        /*
         * SVG Font Awesome circle.
         */
        for (const element of candidates) {
            const iconName =
                normalize(
                    element.getAttribute(
                        'data-icon'
                    )
                );

            if (
                iconName === 'circle'
            ) {
                const style =
                    window.getComputedStyle(
                        element
                    );

                if (
                    isGreenColor(
                        style.color
                    ) ||
                    isGreenColor(
                        style.fill
                    )
                ) {
                    return true;
                }
            }
        }

        /*
         * Generic green circular dot.
         *
         * This catches Syncro changing icon libraries while still
         * following their documented green-dot convention.
         */
        for (const element of candidates) {
            const rect =
                element.getBoundingClientRect();

            if (
                rect.width <= 0 ||
                rect.height <= 0 ||
                rect.width > 30 ||
                rect.height > 30
            ) {
                continue;
            }

            const style =
                window.getComputedStyle(
                    element
                );

            const classes =
                normalize(
                    typeof element.className ===
                        'string'
                        ? element.className
                        : element.getAttribute(
                              'class'
                          )
                );

            const text =
                normalize(
                    element.textContent
                );

            const looksCircular =
                classes.includes('circle') ||
                classes.includes('dot') ||
                classes.includes('status') ||
                text === '●' ||
                text === '⬤' ||
                text === '•';

            if (!looksCircular) {
                continue;
            }

            if (
                isGreenColor(
                    style.color
                ) ||
                isGreenColor(
                    style.backgroundColor
                ) ||
                isGreenColor(
                    style.fill
                )
            ) {
                return true;
            }
        }

        return null;
    }

    /*
     * ------------------------------------------------------------
     * Final Online determination
     * ------------------------------------------------------------
     */

    function isAssetOnline(row) {
        /*
         * 1. Prefer explicit data already supplied by Syncro.
         */
        const propStatus =
            getOnlineStateFromProps(row);

        if (propStatus !== null) {
            return propStatus;
        }

        /*
         * 2. Look ONLY in the Asset Name cell for Syncro's
         *    green/empty status dot.
         */
        const assetCell =
            getAssetNameCell(row);

        const dotStatus =
            inspectStatusDot(assetCell);

        if (dotStatus !== null) {
            return dotStatus;
        }

        /*
         * Unknown/non-RMM/manual asset.
         */
        return false;
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
        const rows =
            getAssetRows();

        rows.forEach(row => {
            /*
             * Remember Syncro's current inline display setting.
             */
            row.dataset.tnsOriginalDisplay =
                row.style.display || '';

            if (isAssetOnline(row)) {
                /*
                 * Leave online rows exactly as Syncro had them.
                 */
                row.style.display =
                    row.dataset
                        .tnsOriginalDisplay;
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
            if (
                Object.prototype.hasOwnProperty.call(
                    row.dataset,
                    'tnsOriginalDisplay'
                )
            ) {
                row.style.display =
                    row.dataset
                        .tnsOriginalDisplay;

                delete row.dataset
                    .tnsOriginalDisplay;
            }
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
             * Refresh the count/status snapshot immediately
             * before filtering.
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

    function getSelectionState() {
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
         * Use the real Syncro checkbox click so its native
         * bulk-action system recognizes the selection.
         */
        checkbox.click();
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
     * UI
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

    /*
     * ------------------------------------------------------------
     * Initialization
     *
     * This retry only waits for Syncro to finish building the table.
     * It stops completely once initialized.
     * ------------------------------------------------------------
     */

    let initializeAttempts = 0;

    function initialize() {
        const table =
            getAssetsTable();

        const rows =
            getAssetRows();

        if (
            !table ||
            rows.length === 0
        ) {
            initializeAttempts++;

            if (
                initializeAttempts < 30
            ) {
                window.setTimeout(
                    initialize,
                    500
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
     * Update only the Select/Deselect label when Syncro
     * checkboxes are manually changed.
     *
     * This does NOT affect Online Only.
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

    initialize();
})();
