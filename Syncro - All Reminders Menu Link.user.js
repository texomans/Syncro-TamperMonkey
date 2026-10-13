// ==UserScript==
// @name         Syncro - All Reminders Menu Link
// @namespace    https://texomans.com/
// @version      1.0.0
// @description  Add All Reminders beneath New Reminder in Syncro's user menu.
// @match        https://*.syncromsp.com/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20All%20Reminders%20Menu%20Link.user.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20All%20Reminders%20Menu%20Link.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    const MARKER = 'data-syncro-all-reminders';
    const MENU_SELECTOR = '#user-menu-partial .dropdown-menu, #user-menu-partial .user-menu, #user-menu-partial [role="menu"], .tns-mobile-user-menu';

    function addLinks() {
        document.querySelectorAll(MENU_SELECTOR).forEach(root => {
            const reminder = Array.from(root.querySelectorAll('a, button, [role="menuitem"]'))
                .find(element => element.textContent.replace(/\s+/g, ' ').trim() === 'New Reminder');
            if (!reminder) return;

            // Insert alongside the original row, retaining native menu styling.
            const listItem = reminder.closest('li');
            const row = listItem && root.contains(listItem) ? listItem : reminder;
            const parent = row.parentElement;
            if (!parent || parent.querySelector(`[${MARKER}]`)) return;

            // If Syncro adds this link itself, avoid a second entry.
            if (Array.from(root.querySelectorAll('a')).some(link =>
                link.textContent.replace(/\s+/g, ' ').trim() === 'All Reminders'
            )) return;

            const link = document.createElement('a');
            link.href = '/reminders';
            link.className = reminder.className;
            // Do not copy popup attributes or listeners from New Reminder.
            if (reminder.getAttribute('role') === 'menuitem') link.setAttribute('role', 'menuitem');
            link.setAttribute(MARKER, '');

            const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            icon.setAttribute('viewBox', '0 0 24 24');
            icon.setAttribute('width', '14');
            icon.setAttribute('height', '14');
            icon.setAttribute('fill', 'none');
            icon.setAttribute('stroke', 'currentColor');
            icon.setAttribute('stroke-width', '1.6');
            icon.setAttribute('stroke-linecap', 'round');
            icon.setAttribute('stroke-linejoin', 'round');
            icon.setAttribute('aria-hidden', 'true');
            icon.setAttribute('focusable', 'false');
            icon.style.cssText = 'display:inline-block;vertical-align:-2px;margin-right:6px;flex-shrink:0;';
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', 'M3 16h12l-2-3V8a4 4 0 0 0-8 0v5l-2 3 M7 19a2 2 0 0 0 4 0 M9 3V2 M17 6h4 M17 10h4 M18 14h3');
            icon.appendChild(path);
            link.append(icon, document.createTextNode('All Reminders'));

            let newRow = link;
            if (row !== reminder) {
                newRow = document.createElement('li');
                newRow.className = row.className;
                if (row.hasAttribute('role')) newRow.setAttribute('role', row.getAttribute('role'));
                newRow.appendChild(link);
            }
            row.after(newRow);
        });
    }

    // Syncro can render or replace the user menu after page load.
    let queued = false;
    const observer = new MutationObserver(() => {
        if (queued) return;
        queued = true;
        requestAnimationFrame(() => {
            queued = false;
            addLinks();
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    addLinks();
})();
