// ==UserScript==
// @name         SCustom Top Navigation Colors
// @namespace    https://texomans.com/
// @version      1.1.0
// @description  Customizes Syncro top navigation, dropdown menus, and navigation hover colors.
// @match        https://*.syncromsp.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ============================================================
    // COLORS
    // ============================================================

    // Upper navigation bar
    const TOP_BAR_COLOR = '#0F1926';

    // Thin separator between the two navigation rows
    const DIVIDER_COLOR = '#1E2227';

    // Lower navigation bar
    const BOTTOM_BAR_COLOR = '#262A30';

    // Hover / selected color for upper navigation and user menu
    const DROPDOWN_HOVER_COLOR = '#172638';

    // Hover / selected color for lower navigation and More menu
    const BOTTOM_DROPDOWN_HOVER_COLOR = '#30353C';


    // ============================================================
    // DO NOT NEED TO EDIT BELOW HERE
    // ============================================================

    const STYLE_ID = 'tns-syncro-custom-navigation-colors';


    function installStyles() {

        let style = document.getElementById(STYLE_ID);

        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;

            (document.head || document.documentElement)
                .appendChild(style);
        }


        style.textContent = `

            /* ====================================================
               UPPER NAVIGATION BAR
               ==================================================== */

            .syncro-top-nav-container .main-navbar-container,
            .syncro-top-nav-container .main-navbar-container > .container-fluid,
            .syncro-top-nav-container nav.main-navbar,

            #section_header .main-navbar-container,
            #section_header .main-navbar-container > .container-fluid,
            #section_header nav.main-navbar {

                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
                background-image: none !important;
                box-shadow: none !important;
            }


            /* ====================================================
               DIVIDER BETWEEN NAVIGATION ROWS
               ==================================================== */

            .syncro-top-nav-container .main-navbar-container,
            #section_header .main-navbar-container {

                border-bottom:
                    2px solid ${DIVIDER_COLOR} !important;
            }


            /* ====================================================
               LOWER NAVIGATION BAR
               ==================================================== */

            .syncro-top-nav-container .sub-navbar-container,
            .syncro-top-nav-container .sub-navbar-container > .container-fluid,
            .syncro-top-nav-container nav.sub-navbar,
            .syncro-top-nav-container .sub-navbar-links,

            #section_header .sub-navbar-container,
            #section_header .sub-navbar-container > .container-fluid,
            #section_header nav.sub-navbar {

                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
                background-image: none !important;
                box-shadow: none !important;
            }


            /* ====================================================
               UPPER NAV ICON BUTTON HOVER
               ==================================================== */

            /*
             * Plus, notifications, messages, help, etc.
             */

            #user-menu-partial .main-navbar-right > .dropdown > .btn:hover,
            #user-menu-partial .main-navbar-right > .dropdown > .btn:focus,

            #user-menu-partial .notification-nav > .btn:hover,
            #user-menu-partial .notification-nav > .btn:focus,

            #user-menu-partial .timer-nav > .btn:hover,
            #user-menu-partial .timer-nav > .btn:focus {

                background: ${DROPDOWN_HOVER_COLOR} !important;
                background-color: ${DROPDOWN_HOVER_COLOR} !important;
                background-image: none !important;
                box-shadow: none !important;
            }


            /* ====================================================
               USER / NAME BUTTON
               ==================================================== */

            /*
             * Fixes the old Syncro blue-gray hover color
             * on the user/name button.
             */

            #user-menu-partial .user-menu button:hover,
            #user-menu-partial .user-menu button:focus,
            #user-menu-partial .user-menu button:active,

            #user-menu-partial .user-menu a:hover,
            #user-menu-partial .user-menu a:focus,
            #user-menu-partial .user-menu a:active,

            #user-menu-partial .user-menu [role="button"]:hover,
            #user-menu-partial .user-menu [role="button"]:focus,
            #user-menu-partial .user-menu [role="button"]:active,

            #user-menu-partial .user-menu [aria-haspopup="true"]:hover,
            #user-menu-partial .user-menu [aria-haspopup="true"]:focus,

            #user-menu-partial .user-menu [aria-expanded="true"] {

                background: ${DROPDOWN_HOVER_COLOR} !important;
                background-color: ${DROPDOWN_HOVER_COLOR} !important;
                background-image: none !important;
                box-shadow: none !important;
            }


            /* ====================================================
               USER DROPDOWN
               ==================================================== */

            /*
             * The user dropdown belongs to the upper navigation,
             * so its base color matches TOP_BAR_COLOR.
             */

            #user-menu-partial .user-menu .dropdown-menu,
            #user-menu-partial .user-menu [role="menu"] {

                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
                background-image: none !important;

                border:
                    1px solid ${DIVIDER_COLOR} !important;

                box-shadow:
                    0 4px 10px rgba(0, 0, 0, 0.40) !important;
            }


            /* ====================================================
               USER DROPDOWN ITEMS - NORMAL
               ==================================================== */

            #user-menu-partial .user-menu .dropdown-menu > li,
            #user-menu-partial .user-menu .dropdown-menu > li > a,

            #user-menu-partial .user-menu [role="menu"] a,
            #user-menu-partial .user-menu [role="menu"] button,
            #user-menu-partial .user-menu [role="menuitem"] {

                background-color: transparent !important;
                background-image: none !important;
            }


            /* ====================================================
               USER DROPDOWN ITEMS - HOVER
               ==================================================== */

            #user-menu-partial .user-menu .dropdown-menu > li > a:hover,
            #user-menu-partial .user-menu .dropdown-menu > li > a:focus,

            #user-menu-partial .user-menu [role="menu"] a:hover,
            #user-menu-partial .user-menu [role="menu"] a:focus,

            #user-menu-partial .user-menu [role="menu"] button:hover,
            #user-menu-partial .user-menu [role="menu"] button:focus,

            #user-menu-partial .user-menu [role="menuitem"]:hover,
            #user-menu-partial .user-menu [role="menuitem"]:focus {

                background: ${DROPDOWN_HOVER_COLOR} !important;
                background-color: ${DROPDOWN_HOVER_COLOR} !important;
                background-image: none !important;
            }


            /* ====================================================
               MORE BUTTON
               ==================================================== */

            /*
             * More belongs to the LOWER navigation.

             * Normal state stays transparent so BOTTOM_BAR_COLOR
             * shows through.

             * Hover/open state gets a slightly lighter charcoal.
             */

            #top-nav-more-dropdown-syn {

                background-color: transparent !important;
                background-image: none !important;
            }


            #top-nav-more-dropdown-syn:hover,
            #top-nav-more-dropdown-syn:focus,
            #top-nav-more-dropdown-syn:active,

            .sub-nav-more-dropdown.open
                > #top-nav-more-dropdown-syn,

            #top-nav-more-dropdown-syn[aria-expanded="true"] {

                background:
                    ${BOTTOM_DROPDOWN_HOVER_COLOR} !important;

                background-color:
                    ${BOTTOM_DROPDOWN_HOVER_COLOR} !important;

                background-image: none !important;
                box-shadow: none !important;
            }


            /* ====================================================
               MORE DROPDOWN
               ==================================================== */

            /*
             * This intentionally matches the LOWER navigation
             * instead of the upper blue/nav color.
             */

            .sub-nav-more-dropdown .dropdown-menu {

                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
                background-image: none !important;

                border:
                    1px solid ${DIVIDER_COLOR} !important;

                box-shadow:
                    0 4px 10px rgba(0, 0, 0, 0.40) !important;
            }


            /* ====================================================
               MORE DROPDOWN ITEMS - NORMAL
               ==================================================== */

            .sub-nav-more-dropdown .dropdown-menu > li,
            .sub-nav-more-dropdown .dropdown-menu > li > a,
            .sub-nav-more-dropdown .dropdown-menu .sub-nav-item,
            .sub-nav-more-dropdown .dropdown-menu .sub-nav-item > a {

                background-color: transparent !important;
                background-image: none !important;
            }


            /* ====================================================
               MORE DROPDOWN ITEMS - HOVER
               ==================================================== */

            .sub-nav-more-dropdown .dropdown-menu > li > a:hover,
            .sub-nav-more-dropdown .dropdown-menu > li > a:focus,

            .sub-nav-more-dropdown
                .dropdown-menu
                .sub-nav-item:hover
                > a,

            .sub-nav-more-dropdown
                .dropdown-menu
                .sub-nav-item
                > a:focus {

                background:
                    ${BOTTOM_DROPDOWN_HOVER_COLOR} !important;

                background-color:
                    ${BOTTOM_DROPDOWN_HOVER_COLOR} !important;

                background-image: none !important;
            }


            /* ====================================================
               REMOVE SYNCRO'S ORIGINAL NAV BACKGROUND EFFECTS
               ==================================================== */

            .main-navbar-container::before,
            .main-navbar-container::after,
            .sub-navbar-container::before,
            .sub-navbar-container::after {

                background-image: none !important;
                box-shadow: none !important;
            }

        `;
    }


    // Install immediately.
    installStyles();


    // Run again once the DOM is available.
    document.addEventListener(
        'DOMContentLoaded',
        installStyles
    );

})();
