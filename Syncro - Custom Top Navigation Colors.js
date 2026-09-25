// ==UserScript==
// @name         Syncro - Custom Top Navigation Colors
// @namespace    https://texomans.com/
// @version      1.1.7
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

    // Thin separator / borders
    const DIVIDER_COLOR = '#1E2227';

    // Lower navigation bar
    const BOTTOM_BAR_COLOR = '#262A30';

    const MOBILE_BREAKPOINT = 767;
    const STYLE_ID = 'tns-syncro-custom-navigation-colors';


    // ============================================================
    // CSS
    // ============================================================

    function installStyles() {
        let style = document.getElementById(STYLE_ID);

        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            (document.head || document.documentElement).appendChild(style);
        }

        style.textContent = `

            /* ====================================================
               UPPER NAVIGATION
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

            .syncro-top-nav-container .main-navbar-container,
            #section_header .main-navbar-container {
                border-bottom: 2px solid ${DIVIDER_COLOR} !important;
            }


            /* ====================================================
               LOWER NAVIGATION
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
               MAIN SEARCH BOX
               ==================================================== */

            #top-nav-search-syn .soulmate-search-input,
            #customer_search .soulmate-search-input {
                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
                background-image: none !important;
                border: 1px solid ${DIVIDER_COLOR} !important;
                box-shadow: none !important;
            }

            #top-nav-search-syn .soulmate-search-input:hover,
            #top-nav-search-syn .soulmate-search-input:focus,
            #customer_search .soulmate-search-input:hover,
            #customer_search .soulmate-search-input:focus {
                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
                border-color: ${DIVIDER_COLOR} !important;
                box-shadow: none !important;
                outline: none !important;
            }


            /* ====================================================
               SEARCH AUTOCOMPLETE
               ==================================================== */

            #soulmate,
            .soulmate,
            .soulmate-results,
            .soulmate-suggestions,
            .soulmate-type-container,
            .soulmate-type-suggestions {
                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
                background-image: none !important;
                border-color: ${DIVIDER_COLOR} !important;
            }

            #soulmate .soulmate-type,
            #soulmate .soulmate-type-title,
            .soulmate .soulmate-type,
            .soulmate .soulmate-type-title,
            .soulmate-type,
            .soulmate-type-title {
                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
                background-image: none !important;
                border-color: ${DIVIDER_COLOR} !important;
            }

            #soulmate .soulmate-suggestion,
            .soulmate .soulmate-suggestion,
            .soulmate-suggestion {
                background: transparent !important;
                background-color: transparent !important;
                background-image: none !important;
                border-color: ${DIVIDER_COLOR} !important;
            }

            #soulmate .soulmate-suggestion:hover,
            #soulmate .soulmate-suggestion.focus,
            #soulmate .soulmate-suggestion.active,
            .soulmate .soulmate-suggestion:hover,
            .soulmate .soulmate-suggestion.focus,
            .soulmate .soulmate-suggestion.active,
            .soulmate-suggestion:hover,
            .soulmate-suggestion.focus,
            .soulmate-suggestion.active {
                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
            }


            /* ====================================================
               TOOLTIPS
               ==================================================== */

            .tooltip {
                opacity: 1 !important;
            }

            .tooltip .tooltip-inner {
                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
                background-image: none !important;
                border: 1px solid ${DIVIDER_COLOR} !important;
                box-shadow: 0 3px 8px rgba(0, 0, 0, 0.4) !important;
            }

            .tooltip.top .tooltip-arrow,
            .tooltip.top-left .tooltip-arrow,
            .tooltip.top-right .tooltip-arrow {
                border-top-color: ${TOP_BAR_COLOR} !important;
            }

            .tooltip.bottom .tooltip-arrow,
            .tooltip.bottom-left .tooltip-arrow,
            .tooltip.bottom-right .tooltip-arrow {
                border-bottom-color: ${TOP_BAR_COLOR} !important;
            }

            .tooltip.left .tooltip-arrow {
                border-left-color: ${TOP_BAR_COLOR} !important;
            }

            .tooltip.right .tooltip-arrow {
                border-right-color: ${TOP_BAR_COLOR} !important;
            }


            /* ====================================================
               DESKTOP UPPER NAV HOVER
               ==================================================== */

            @media (min-width: ${MOBILE_BREAKPOINT + 1}px) {

                #user-menu-partial .main-navbar-right .btn:hover,
                #user-menu-partial .main-navbar-right .btn:focus,
                #user-menu-partial .main-navbar-right .btn:active,
                #user-menu-partial .main-navbar-right .open > .btn,
                #user-menu-partial .main-navbar-right .open > .dropdown-toggle,
                #user-menu-partial .main-navbar-right [aria-expanded="true"] {
                    background: ${BOTTOM_BAR_COLOR} !important;
                    background-color: ${BOTTOM_BAR_COLOR} !important;
                    background-image: none !important;
                    box-shadow: none !important;
                }

                #user-menu-partial .user-menu button:hover,
                #user-menu-partial .user-menu button:focus,
                #user-menu-partial .user-menu button:active,
                #user-menu-partial .user-menu a:hover,
                #user-menu-partial .user-menu a:focus,
                #user-menu-partial .user-menu a:active,
                #user-menu-partial .user-menu [role="button"]:hover,
                #user-menu-partial .user-menu [role="button"]:focus,
                #user-menu-partial .user-menu [role="button"]:active,
                #user-menu-partial .user-menu [aria-expanded="true"] {
                    background: ${BOTTOM_BAR_COLOR} !important;
                    background-color: ${BOTTOM_BAR_COLOR} !important;
                    background-image: none !important;
                    box-shadow: none !important;
                }
            }


            /* ====================================================
               UPPER NAV DROPDOWNS
               ==================================================== */

            #user-menu-partial .dropdown-menu,
            #user-menu-partial .user-menu .dropdown-menu,
            #user-menu-partial .add-new-dropdown-menu,
            #user-menu-partial .user-menu [role="menu"] {
                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
                background-image: none !important;
                border: 1px solid ${DIVIDER_COLOR} !important;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4) !important;
            }

            #user-menu-partial .dropdown-menu li,
            #user-menu-partial .dropdown-menu li > a,
            #user-menu-partial .dropdown-menu a,
            #user-menu-partial .dropdown-menu button,
            #user-menu-partial .user-menu [role="menu"] a,
            #user-menu-partial .user-menu [role="menu"] button,
            #user-menu-partial .user-menu [role="menuitem"] {
                background: transparent !important;
                background-color: transparent !important;
                background-image: none !important;
            }

            #user-menu-partial .dropdown-menu li > a:hover,
            #user-menu-partial .dropdown-menu li > a:focus,
            #user-menu-partial .dropdown-menu button:hover,
            #user-menu-partial .dropdown-menu button:focus,
            #user-menu-partial .user-menu [role="menu"] a:hover,
            #user-menu-partial .user-menu [role="menu"] a:focus,
            #user-menu-partial .user-menu [role="menuitem"]:hover,
            #user-menu-partial .user-menu [role="menuitem"]:focus {
                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
            }


            /* ====================================================
               MORE BUTTON / DROPDOWN
               ==================================================== */

            #top-nav-more-dropdown-syn {
                background-color: transparent !important;
                background-image: none !important;
            }

            #top-nav-more-dropdown-syn:hover,
            #top-nav-more-dropdown-syn:focus,
            #top-nav-more-dropdown-syn:active,
            .sub-nav-more-dropdown.open > #top-nav-more-dropdown-syn,
            #top-nav-more-dropdown-syn[aria-expanded="true"] {
                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
                background-image: none !important;
                box-shadow: none !important;
            }

            .sub-nav-more-dropdown .dropdown-menu {
                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
                background-image: none !important;
                border: 1px solid ${DIVIDER_COLOR} !important;
                box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4) !important;
            }

            .sub-nav-more-dropdown .dropdown-menu > li,
            .sub-nav-more-dropdown .dropdown-menu > li > a,
            .sub-nav-more-dropdown .dropdown-menu .sub-nav-item,
            .sub-nav-more-dropdown .dropdown-menu .sub-nav-item > a {
                background: transparent !important;
                background-color: transparent !important;
                background-image: none !important;
            }

            .sub-nav-more-dropdown .dropdown-menu > li > a:hover,
            .sub-nav-more-dropdown .dropdown-menu > li > a:focus,
            .sub-nav-more-dropdown .dropdown-menu .sub-nav-item:hover > a,
            .sub-nav-more-dropdown .dropdown-menu .sub-nav-item > a:focus {
                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
            }


            /* ====================================================
               NOTIFICATION DRAWER
               ==================================================== */

            .tns-notification-panel,
            .tns-notification-panel > * {
                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
                background-image: none !important;
                border-color: ${DIVIDER_COLOR} !important;
            }

            .tns-notification-panel div,
            .tns-notification-panel section,
            .tns-notification-panel article,
            .tns-notification-panel header,
            .tns-notification-panel footer,
            .tns-notification-panel main,
            .tns-notification-panel ul,
            .tns-notification-panel li {
                background: transparent !important;
                background-color: transparent !important;
                background-image: none !important;
                border-color: ${DIVIDER_COLOR} !important;
            }

            .tns-notification-panel a:hover,
            .tns-notification-panel a:focus {
                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
            }

            .tns-notification-dismiss-all {
                background: ${BOTTOM_BAR_COLOR} !important;
                background-color: ${BOTTOM_BAR_COLOR} !important;
                background-image: none !important;
                border: 1px solid ${DIVIDER_COLOR} !important;
                box-shadow: none !important;
            }

            .tns-notification-dismiss-all:hover,
            .tns-notification-dismiss-all:focus {
                background: ${TOP_BAR_COLOR} !important;
                background-color: ${TOP_BAR_COLOR} !important;
            }


            /* ====================================================
               MOBILE USER MENU
               ==================================================== */

            @media (max-width: ${MOBILE_BREAKPOINT}px) {

                /*
                 * Prevent touch devices from keeping a fake hover
                 * color on the user icon after tapping it.
                 */

                #user-menu-partial .user-menu,
                #user-menu-partial .user-menu > *,
                #user-menu-partial .user-menu button,
                #user-menu-partial .user-menu a,
                #user-menu-partial .user-menu [role="button"],
                #user-menu-partial .user-menu button:hover,
                #user-menu-partial .user-menu a:hover,
                #user-menu-partial .user-menu [role="button"]:hover,
                #user-menu-partial .user-menu button:focus,
                #user-menu-partial .user-menu a:focus,
                #user-menu-partial .user-menu [role="button"]:focus,
                #user-menu-partial .user-menu [aria-expanded="true"] {
                    background: transparent !important;
                    background-color: transparent !important;
                    background-image: none !important;
                    box-shadow: none !important;
                }

                #user-menu-partial .user-menu button:active,
                #user-menu-partial .user-menu a:active,
                #user-menu-partial .user-menu [role="button"]:active {
                    background: ${BOTTOM_BAR_COLOR} !important;
                    background-color: ${BOTTOM_BAR_COLOR} !important;
                }

                .tns-mobile-user-menu {
                    background: ${TOP_BAR_COLOR} !important;
                    background-color: ${TOP_BAR_COLOR} !important;
                    background-image: none !important;
                    border: 1px solid ${DIVIDER_COLOR} !important;
                    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.4) !important;
                }

                .tns-mobile-user-menu div,
                .tns-mobile-user-menu nav,
                .tns-mobile-user-menu section,
                .tns-mobile-user-menu ul,
                .tns-mobile-user-menu li,
                .tns-mobile-user-menu header,
                .tns-mobile-user-menu footer {
                    background: transparent !important;
                    background-color: transparent !important;
                    background-image: none !important;
                    border-color: ${DIVIDER_COLOR} !important;
                }

                .tns-mobile-user-menu a,
                .tns-mobile-user-menu button,
                .tns-mobile-user-menu [role="menuitem"],
                .tns-mobile-user-menu [role="button"] {
                    background: transparent !important;
                    background-color: transparent !important;
                    background-image: none !important;
                }

                .tns-mobile-user-menu a:hover,
                .tns-mobile-user-menu a:focus,
                .tns-mobile-user-menu a:active,
                .tns-mobile-user-menu button:hover,
                .tns-mobile-user-menu button:focus,
                .tns-mobile-user-menu button:active,
                .tns-mobile-user-menu [role="menuitem"]:hover,
                .tns-mobile-user-menu [role="menuitem"]:focus,
                .tns-mobile-user-menu [role="menuitem"]:active {
                    background: ${BOTTOM_BAR_COLOR} !important;
                    background-color: ${BOTTOM_BAR_COLOR} !important;
                }
            }


            /* ====================================================
               REMOVE ORIGINAL NAV EFFECTS
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


    // ============================================================
    // MOBILE USER MENU
    // ============================================================

    function tagMobileUserMenu() {
        if (window.innerWidth > MOBILE_BREAKPOINT) {
            document
                .querySelectorAll('.tns-mobile-user-menu')
                .forEach(element => {
                    element.classList.remove('tns-mobile-user-menu');
                });

            return;
        }

        const userRoot =
            document.querySelector('#user-menu-partial .user-menu');

        if (!userRoot) {
            return;
        }

        const candidates = [
            userRoot,
            ...userRoot.querySelectorAll('div, nav, section, ul')
        ].filter(element => {
            const text =
                (element.textContent || '')
                    .replace(/\s+/g, ' ')
                    .trim();

            return (
                text.includes('Notifications') &&
                (
                    text.includes('Preferences:') ||
                    text.includes('Tabs Customization')
                )
            );
        });

        candidates.sort(
            (a, b) =>
                (a.textContent || '').length -
                (b.textContent || '').length
        );

        const mobileMenu = candidates[0];

        document
            .querySelectorAll('.tns-mobile-user-menu')
            .forEach(element => {
                if (element !== mobileMenu) {
                    element.classList.remove('tns-mobile-user-menu');
                }
            });

        if (mobileMenu) {
            mobileMenu.classList.add('tns-mobile-user-menu');
        }
    }


    // ============================================================
    // NOTIFICATION DRAWER
    // ============================================================

    function tagNotificationPanel() {

        /*
         * Find the small element whose text is specifically
         * "Syncro Notifications".
         */

        const titleElement =
            Array.from(
                document.querySelectorAll(
                    'div, span, p, h1, h2, h3, h4, h5'
                )
            )
            .find(element => {
                const text =
                    (element.textContent || '')
                        .replace(/\s+/g, ' ')
                        .trim();

                return text === 'Syncro Notifications';
            });


        if (!titleElement) {
            return;
        }


        /*
         * Walk upward from the title until we find the actual
         * tall right-side notification drawer.
         */

        let element = titleElement;
        let notificationPanel = null;


        while (
            element &&
            element !== document.body
        ) {
            const rect =
                element.getBoundingClientRect();

            const computedStyle =
                window.getComputedStyle(element);

            const nearRightEdge =
                Math.abs(
                    window.innerWidth - rect.right
                ) <= 25;

            const tallEnough =
                rect.height >=
                window.innerHeight * 0.60;

            const reasonableWidth =
                rect.width >= 250 &&
                rect.width <= 700;

            const drawerPosition =
                computedStyle.position === 'fixed' ||
                computedStyle.position === 'absolute';


            if (
                nearRightEdge &&
                tallEnough &&
                reasonableWidth &&
                drawerPosition
            ) {
                notificationPanel = element;
                break;
            }


            element = element.parentElement;
        }


        /*
         * Fallback for layouts where Syncro changes the
         * positioning method.
         */

        if (!notificationPanel) {
            element = titleElement;

            while (
                element &&
                element !== document.body
            ) {
                const rect =
                    element.getBoundingClientRect();

                const nearRightEdge =
                    Math.abs(
                        window.innerWidth - rect.right
                    ) <= 25;

                const tallEnough =
                    rect.height >=
                    window.innerHeight * 0.60;

                const reasonableWidth =
                    rect.width >= 250 &&
                    rect.width <= 700;


                if (
                    nearRightEdge &&
                    tallEnough &&
                    reasonableWidth
                ) {
                    notificationPanel = element;
                    break;
                }


                element = element.parentElement;
            }
        }


        if (!notificationPanel) {
            return;
        }


        /*
         * Remove the class from any older drawer that Syncro
         * may have replaced.
         */

        document
            .querySelectorAll('.tns-notification-panel')
            .forEach(element => {
                if (element !== notificationPanel) {
                    element.classList.remove(
                        'tns-notification-panel'
                    );
                }
            });


        notificationPanel.classList.add(
            'tns-notification-panel'
        );


        /*
         * Only style the Dismiss All button.
         * Individual red X buttons remain untouched.
         */

        notificationPanel
            .querySelectorAll('button, a')
            .forEach(element => {
                const text =
                    (element.textContent || '')
                        .replace(/\s+/g, ' ')
                        .trim();

                if (text === 'Dismiss All') {
                    element.classList.add(
                        'tns-notification-dismiss-all'
                    );
                }
            });
    }


    // ============================================================
    // START
    // ============================================================

    installStyles();


    document.addEventListener(
        'DOMContentLoaded',
        () => {
            installStyles();
            tagMobileUserMenu();
            tagNotificationPanel();
        }
    );


    window.addEventListener(
        'resize',
        () => {
            tagMobileUserMenu();
            tagNotificationPanel();
        }
    );


    // ============================================================
    // WATCH SYNCRO DYNAMIC CONTENT
    // ============================================================

    let mutationTimer = null;


    const observer =
        new MutationObserver(() => {
            clearTimeout(mutationTimer);

            mutationTimer =
                setTimeout(() => {
                    tagMobileUserMenu();
                    tagNotificationPanel();
                }, 75);
        });


    function startObserver() {
        if (!document.body) {
            setTimeout(startObserver, 50);
            return;
        }

        observer.observe(
            document.body,
            {
                childList: true,
                subtree: true
            }
        );
    }


    startObserver();

})();
