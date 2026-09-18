// ==UserScript==
// @name         Syncro RMM Alerts - Hide Ticketed Alerts
// @namespace    https://texomans.com/
// @version      1.0.0
// @description  Hides RMM alerts that already have a ticket and adds a Show Ticketed Alerts toggle.
// @match        https://*.syncromsp.com/rmm_alerts*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    let showTicketed = false;
    let updateQueued = false;

    const BUTTON_ID = 'tns-show-ticketed-alerts';
    const HIDDEN_CLASS = 'tns-ticketed-alert-hidden';

    // Hide rows without modifying Syncro's own inline styles.
    const style = document.createElement('style');
    style.textContent = `
        .${HIDDEN_CLASS} {
            display: none !important;
        }
    `;
    document.head.appendChild(style);

    /**
     * Determine whether a row has a real Syncro ticket tied to it.
     *
     * We specifically look in the Ticket column for:
     *     /tickets/123456789
     *
     * This avoids treating the "Create" link on an unticketed alert
     * as an existing ticket.
     */
    function rowHasTicket(row, ticketColumnIndex) {
        const cell = row.cells[ticketColumnIndex];

        if (!cell) {
            return false;
        }

        return Array.from(cell.querySelectorAll('a[href]')).some(link => {
            try {
                const url = new URL(link.href, window.location.origin);
                return /^\/tickets\/\d+\/?$/.test(url.pathname);
            } catch {
                return false;
            }
        });
    }

    function findTicketColumn(table) {
        const headers = Array.from(table.querySelectorAll('thead th'));

        return headers.findIndex(header =>
            header.textContent.trim().toLowerCase() === 'ticket'
        );
    }

    function updateAlertRows() {
        const tables = document.querySelectorAll('table.index-table');

        let ticketedCount = 0;

        tables.forEach(table => {
            const ticketColumnIndex = findTicketColumn(table);

            if (ticketColumnIndex === -1) {
                return;
            }

            table.querySelectorAll('tbody > tr').forEach(row => {
                const isTicketed = rowHasTicket(row, ticketColumnIndex);

                if (isTicketed) {
                    ticketedCount++;
                }

                row.classList.toggle(
                    HIDDEN_CLASS,
                    isTicketed && !showTicketed
                );
            });
        });

        updateButton(ticketedCount);
    }

    function updateButton(ticketedCount) {
        const button = document.getElementById(BUTTON_ID);

        if (!button) {
            return;
        }

        button.textContent = showTicketed
            ? 'Hide Ticketed Alerts'
            : 'Show Ticketed Alerts';

        if (showTicketed) {
            button.title = `${ticketedCount} ticketed alert${ticketedCount === 1 ? '' : 's'} currently shown`;
        } else {
            button.title = `${ticketedCount} ticketed alert${ticketedCount === 1 ? '' : 's'} hidden`;
        }
    }

    function addToggleButton() {
        if (document.getElementById(BUTTON_ID)) {
            return;
        }

        const unmappedButton = Array.from(
            document.querySelectorAll('a.btn')
        ).find(link =>
            link.textContent.trim() === 'Show Unmapped Alerts'
        );

        if (!unmappedButton || !unmappedButton.parentElement) {
            return;
        }

        const button = document.createElement('button');

        button.id = BUTTON_ID;
        button.type = 'button';
        button.className = 'btn btn-default btn-sm';
        button.textContent = 'Show Ticketed Alerts';

        button.addEventListener('click', () => {
            showTicketed = !showTicketed;
            updateAlertRows();
        });

        // Put it immediately before "Show Unmapped Alerts".
        unmappedButton.parentElement.insertBefore(
            button,
            unmappedButton
        );
    }

    function update() {
        addToggleButton();
        updateAlertRows();
    }

    function queueUpdate() {
        if (updateQueued) {
            return;
        }

        updateQueued = true;

        requestAnimationFrame(() => {
            updateQueued = false;
            update();
        });
    }

    // Initial load.
    update();

    // Syncro can dynamically refresh portions of the page.
    // Reapply our changes whenever rows/buttons are replaced.
    const observer = new MutationObserver(queueUpdate);

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
})();
