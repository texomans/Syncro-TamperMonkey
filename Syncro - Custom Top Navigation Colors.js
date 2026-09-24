// ==UserScript==
// @name         Syncro - Custom Top Navigation Colors
// @namespace    https://texomans.com/
// @version      1.1.3
// @description  Customize the colors of Syncro's main top navigation and secondary navigation bars.
// @match        https://*.syncromsp.com/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20Custom%20Top%20Navigation%20Colors.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20Custom%20Top%20Navigation%20Colors.js
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // COLORS
    // ============================================================

    // Upper navigation bar
    const TOP_BAR_COLOR = '#30343B';

    // Thin separator between the two navigation rows
    const DIVIDER_COLOR = '#1E2227';

    // Lower navigation bar
    const BOTTOM_BAR_COLOR = '#262A30';


    // ============================================================
    // DO NOT NEED TO EDIT BELOW HERE
    // ============================================================

    const STYLE_ID = 'tns-syncro-custom-navigation-colors';

    function installStyles() {
        if (document.getElementById(STYLE_ID)) {
            return;
        }

        const style = document.createElement('style');
        style.id = STYLE_ID;

        style.textContent = `

            /* ====================================================
               MAIN / UPPER NAVIGATION
               ==================================================== */

            .syncro-top-nav-container .main-navbar-container,
            .syncro-top-nav-container .main-navbar-container > .container-fluid,
            .syncro-top-nav-container nav.main-navbar,
            #section_header .main-navbar-container,
            #section_header nav.main-navbar {
                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
                background-image: none !important;
                box-shadow: none !important;
            }


            /* ====================================================
               DIVIDER BETWEEN NAVIGATION ROWS
               ==================================================== */

            .syncro-top-nav-container .main-navbar-container {
                border-bottom: 2px solid ${DIVIDER_COLOR} !important;
            }


            /* ====================================================
               SECONDARY / LOWER NAVIGATION
               ==================================================== */

            .syncro-top-nav-container .sub-navbar-container,
            .syncro-top-nav-container .sub-navbar-container > .container-fluid,
            .syncro-top-nav-container nav.sub-navbar,
            .syncro-top-nav-container .sub-navbar-links,
            #section_header .sub-navbar-container,
            #section_header nav.sub-navbar {
                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
                background-image: none !important;
                box-shadow: none !important;
            }


            /* Remove Syncro's original gradient/shadow effects */
            .main-navbar-container::before,
            .main-navbar-container::after,
            .sub-navbar-container::before,
            .sub-navbar-container::after {
                background-image: none !important;
                box-shadow: none !important;
            }

        `;

        /*
         * document-start can execute before <head> exists.
         * documentElement exists early enough for the CSS to work.
         */
        (document.head || document.documentElement).appendChild(style);
    }

    installStyles();

    /*
     * Syncro occasionally rebuilds portions of the navigation.
     * The stylesheet itself survives, but this provides a fallback
     * in case the page replaces the document head dynamically.
     */
    document.addEventListener('DOMContentLoaded', installStyles);

})();
