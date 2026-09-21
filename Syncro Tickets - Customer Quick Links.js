// ==UserScript==
// @name         Syncro Tickets - Customer Quick Links
// @namespace    https://texomans.com/
// @version      1.0.3
// @description  Adds customer quick links to Syncro ticket pages for Customer Page, All Tickets, Assets, and End Users. Links open in new tabs.
// @match        https://*.syncromsp.com/tickets/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Tickets%20-%20Customer%20Quick%20Links.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Tickets%20-%20Customer%20Quick%20Links.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const WIDGET_ID = 'tns-customer-quick-links';
  const MENU_ID = 'tns-customer-quick-links-menu';
  const STYLE_ID = 'tns-customer-quick-links-style';

  const CUSTOMER_PATH_REGEX =
    /^\/customers\/(\d+)(?:\/.*)?\/?$/i;

  const customerPageCache =
    new Map();

  // ------------------------------------------------------------
  // General helpers
  // ------------------------------------------------------------

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function isVisible(element) {
    if (
      !element ||
      !element.isConnected
    ) {
      return false;
    }

    const style =
      getComputedStyle(element);

    const rect =
      element.getBoundingClientRect();

    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity || '1') !== 0 &&
      rect.width > 0 &&
      rect.height > 0
    );
  }

  // ------------------------------------------------------------
  // Find customer from current ticket
  // ------------------------------------------------------------

  function parseCustomerAnchor(anchor) {
    if (!anchor?.href) {
      return null;
    }

    try {
      const url =
        new URL(
          anchor.href,
          location.origin
        );

      if (
        url.origin !==
        location.origin
      ) {
        return null;
      }

      const match =
        url.pathname.match(
          CUSTOMER_PATH_REGEX
        );

      if (!match) {
        return null;
      }

      return {
        id: match[1],

        url,

        exactPage:
          /^\/customers\/\d+\/?$/i.test(
            url.pathname
          )
      };
    } catch {
      return null;
    }
  }

  function scoreCustomerAnchor(anchor) {
    const parsed =
      parseCustomerAnchor(
        anchor
      );

    if (
      !parsed ||
      !isVisible(anchor)
    ) {
      return -Infinity;
    }

    let score =
      parsed.exactPage
        ? 60
        : 0;

    const text =
      cleanText(
        anchor.textContent
      );

    if (
      anchor.closest(
        '.rs2-ticket-main, .ticket-details, .ticket-info, #ticket, main'
      )
    ) {
      score += 20;
    }

    const row =
      anchor.closest(
        'tr, .form-group, .control-group, .row, [class*="customer"], [class*="organization"]'
      );

    if (
      /customer|organization/i.test(
        cleanText(
          row?.textContent
        )
      )
    ) {
      score += 35;
    }

    if (
      /^customers?$|^organizations?$/i.test(
        text
      )
    ) {
      score -= 30;
    }

    if (
      text &&
      text.length <= 120
    ) {
      score += 5;
    }

    return score;
  }

  function getCustomerInfo() {
    const candidates =
      Array.from(
        document.querySelectorAll(
          'a[href*="/customers/"]'
        )
      )
        .map(
          (anchor) => ({
            anchor,

            parsed:
              parseCustomerAnchor(
                anchor
              ),

            score:
              scoreCustomerAnchor(
                anchor
              )
          })
        )
        .filter(
          (item) =>
            item.parsed &&
            Number.isFinite(
              item.score
            )
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

    const best =
      candidates[0];

    if (!best) {
      return null;
    }

    return {
      id:
        best.parsed.id,

      href:
        best.parsed.url.href,

      name:
        cleanText(
          best.anchor.textContent
        ),

      anchor:
        best.anchor
    };
  }

  // ------------------------------------------------------------
  // Default/fallback links
  // ------------------------------------------------------------

  function buildFallbackLinks(customer) {
    const customerPage =
      new URL(
        `/customers/${customer.id}`,
        location.origin
      );

    /*
     * This is only a fallback.
     *
     * The preferred All Tickets link is discovered directly
     * from the customer's Syncro page below.
     */
    const tickets =
      new URL(
        '/tickets',
        location.origin
      );

    tickets.searchParams.set(
      'customer_id',
      customer.id
    );

    const assets =
      new URL(
        '/customer_assets',
        location.origin
      );

    assets.searchParams.set(
      'customer_id',
      customer.id
    );

    /*
     * Confirmed Syncro End Users / Contacts tab format:
     *
     * /customers/123456#contacts
     */
    const endUsers =
      new URL(
        `/customers/${customer.id}`,
        location.origin
      );

    endUsers.hash =
      'contacts';

    return {
      customer:
        customerPage.href,

      tickets:
        tickets.href,

      assets:
        assets.href,

      contacts:
        endUsers.href
    };
  }

  // ------------------------------------------------------------
  // Discover Syncro's native customer-specific links
  // ------------------------------------------------------------

  function getAnchorContext(anchor) {
    const container =
      anchor.closest(
        'section, article, .panel, .card, .widget, .tab-pane, .well, .row, div'
      );

    return cleanText(
      container?.textContent
    ).slice(
      0,
      1600
    );
  }

  function scoreNativeLink(
    anchor,
    kind,
    customerId
  ) {
    const href =
      anchor.getAttribute(
        'href'
      );

    if (!href) {
      return -Infinity;
    }

    let url;

    try {
      url =
        new URL(
          href,
          location.origin
        );
    } catch {
      return -Infinity;
    }

    if (
      url.origin !==
      location.origin
    ) {
      return -Infinity;
    }

    const path =
      url.pathname.toLowerCase();

    const text =
      cleanText(
        anchor.textContent
      ).toLowerCase();

    const context =
      getAnchorContext(
        anchor
      ).toLowerCase();

    const customerInPath =
      path.includes(
        `/customers/${customerId}`
      );

    const customerInQuery =
      Array.from(
        url.searchParams.entries()
      ).some(
        ([key, value]) =>
          /customer.*id|organization.*id/i.test(
            key
          ) &&
          String(value) ===
            String(customerId)
      );

    let score = 0;

    if (
      customerInPath ||
      customerInQuery
    ) {
      score += 60;
    }

    if (
      /view all|see all/.test(
        text
      )
    ) {
      score += 30;
    }

    // ----------------------------------------------------------
    // Tickets
    // ----------------------------------------------------------

    if (
      kind ===
      'tickets'
    ) {
      if (
        /^\/tickets\/?$/.test(
          path
        )
      ) {
        score += 60;
      } else if (
        customerInPath &&
        /ticket/.test(
          path
        )
      ) {
        score += 45;
      } else {
        return -Infinity;
      }

      if (
        /tickets?/.test(
          text
        )
      ) {
        score += 20;
      }

      if (
        /tickets?/.test(
          context
        )
      ) {
        score += 25;
      }

      /*
       * Strongly favor customer-specific ticket links over a
       * generic /tickets navigation link.
       */
      if (
        !customerInPath &&
        !customerInQuery
      ) {
        score -= 80;
      }
    }

    // ----------------------------------------------------------
    // Assets
    // ----------------------------------------------------------

    if (
      kind ===
      'assets'
    ) {
      if (
        /^\/customer_assets\/?$/.test(
          path
        )
      ) {
        score += 55;
      } else if (
        customerInPath &&
        /asset/.test(
          path
        )
      ) {
        score += 40;
      } else {
        return -Infinity;
      }

      if (
        /assets?/.test(
          text
        )
      ) {
        score += 15;
      }

      if (
        /assets?/.test(
          context
        )
      ) {
        score += 20;
      }

      if (
        !customerInPath &&
        !customerInQuery
      ) {
        score -= 60;
      }
    }

    return score;
  }

  function findNativeLink(
    doc,
    kind,
    customerId
  ) {
    const candidates =
      Array.from(
        doc.querySelectorAll(
          'a[href]'
        )
      )
        .map(
          (anchor) => ({
            href:
              anchor.getAttribute(
                'href'
              ),

            score:
              scoreNativeLink(
                anchor,
                kind,
                customerId
              )
          })
        )
        .filter(
          (item) =>
            Number.isFinite(
              item.score
            )
        )
        .sort(
          (a, b) =>
            b.score -
            a.score
        );

    return (
      candidates[0]?.href ||
      ''
    );
  }

  function absoluteUrl(value) {
    if (!value) {
      return '';
    }

    try {
      return new URL(
        value,
        location.origin
      ).href;
    } catch {
      return '';
    }
  }

  async function discoverCustomerLinks(
    customer
  ) {
    if (
      customerPageCache.has(
        customer.id
      )
    ) {
      return customerPageCache.get(
        customer.id
      );
    }

    const fallback =
      buildFallbackLinks(
        customer
      );

    const promise =
      fetch(
        customer.href,
        {
          method:
            'GET',

          credentials:
            'same-origin'
        }
      )
        .then(
          async (
            response
          ) => {
            if (
              !response.ok
            ) {
              throw new Error(
                `Customer page returned HTTP ${response.status}`
              );
            }

            const html =
              await response.text();

            const doc =
              new DOMParser()
                .parseFromString(
                  html,
                  'text/html'
                );

            /*
             * Find Syncro's actual customer-specific "View All"
             * links from the customer page.
             *
             * We intentionally do NOT alter the ticket URL.
             */
            const nativeTickets =
              findNativeLink(
                doc,
                'tickets',
                customer.id
              );

            const nativeAssets =
              findNativeLink(
                doc,
                'assets',
                customer.id
              );

            const ticketUrl =
              absoluteUrl(
                nativeTickets
              );

            const assetUrl =
              absoluteUrl(
                nativeAssets
              );

            return {
              customer:
                fallback.customer,

              /*
               * Leave Syncro's native customer-specific ticket URL
               * completely untouched.
               */
              tickets:
                ticketUrl ||
                fallback.tickets,

              assets:
                assetUrl ||
                fallback.assets,

              /*
               * Use the known-good End Users tab format directly.
               */
              contacts:
                fallback.contacts
            };
          }
        )
        .catch(
          (
            error
          ) => {
            console.debug(
              '[TNS Customer Quick Links] Native customer link discovery failed; using fallback links.',
              error
            );

            return fallback;
          }
        );

    customerPageCache.set(
      customer.id,
      promise
    );

    return promise;
  }

  // ------------------------------------------------------------
  // Styles
  // ------------------------------------------------------------

  function ensureStyles() {
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
      #${WIDGET_ID} {
        display: inline-block;
        margin-left: 8px;
        vertical-align: middle;
      }

      #${WIDGET_ID} .tns-cql-button {
        display: inline-flex;
        align-items: center;
        gap: 5px;
        min-height: 26px;
        padding: 3px 9px;
        border: 1px solid #b9b9b9;
        border-radius: 4px;
        background: #fff;
        color: #333;
        font: inherit;
        font-size: 12px;
        line-height: 18px;
        cursor: pointer;
        user-select: none;
      }

      #${WIDGET_ID} .tns-cql-button:hover,
      #${WIDGET_ID} .tns-cql-button:focus {
        background: #f5f5f5;
        border-color: #999;
        outline: none;
      }

      #${WIDGET_ID} .tns-cql-caret {
        font-size: 10px;
        opacity: .75;
      }

      #${MENU_ID} {
        position: fixed;
        z-index: 2147483000;
        display: none;
        min-width: 175px;
        padding: 5px 0;
        border: 1px solid rgba(0, 0, 0, .18);
        border-radius: 5px;
        background: #fff;
        box-shadow: 0 6px 16px rgba(0, 0, 0, .18);
      }

      #${MENU_ID}.tns-cql-open {
        display: block;
      }

      #${MENU_ID} a {
        display: block;
        padding: 7px 13px;
        color: #333;
        text-decoration: none;
        white-space: nowrap;
        font-size: 13px;
        line-height: 1.35;
      }

      #${MENU_ID} a:hover,
      #${MENU_ID} a:focus {
        background: #f3f3f3;
        color: #222;
        text-decoration: none;
        outline: none;
      }

      body.dark #${WIDGET_ID} .tns-cql-button {
        background: #2b2b2b;
        color: #ddd;
        border-color: #555;
      }

      body.dark #${WIDGET_ID} .tns-cql-button:hover,
      body.dark #${WIDGET_ID} .tns-cql-button:focus {
        background: #383838;
        border-color: #707070;
      }

      body.dark #${MENU_ID} {
        background: #242424;
        border-color: #555;
        box-shadow: 0 6px 18px rgba(0, 0, 0, .45);
      }

      body.dark #${MENU_ID} a {
        color: #ddd;
      }

      body.dark #${MENU_ID} a:hover,
      body.dark #${MENU_ID} a:focus {
        background: #353535;
        color: #fff;
      }
    `;

    document.head.appendChild(
      style
    );
  }

  // ------------------------------------------------------------
  // Create dropdown
  // ------------------------------------------------------------

  function createMenu(
    links
  ) {
    document
      .getElementById(
        MENU_ID
      )
      ?.remove();

    const menu =
      document.createElement(
        'div'
      );

    menu.id =
      MENU_ID;

    menu.setAttribute(
      'role',
      'menu'
    );

    const menuItems = [
      [
        'customer',
        'Customer Page'
      ],

      [
        'tickets',
        'All Tickets'
      ],

      [
        'assets',
        'Assets'
      ],

      [
        'contacts',
        'End Users'
      ]
    ];

    menuItems.forEach(
      ([
        key,
        label
      ]) => {
        const anchor =
          document.createElement(
            'a'
          );

        anchor.href =
          links[key];

        /*
         * Always preserve the current ticket page.
         */
        anchor.target =
          '_blank';

        anchor.rel =
          'noopener noreferrer';

        anchor.textContent =
          label;

        anchor.dataset.tnsCqlTarget =
          key;

        anchor.setAttribute(
          'role',
          'menuitem'
        );

        menu.appendChild(
          anchor
        );
      }
    );

    document.body.appendChild(
      menu
    );

    return menu;
  }

  function applyLinks(
    menu,
    links
  ) {
    if (
      !menu?.isConnected
    ) {
      return;
    }

    Object.entries(
      links
    ).forEach(
      ([
        key,
        href
      ]) => {
        const anchor =
          menu.querySelector(
            `[data-tns-cql-target="${key}"]`
          );

        if (
          anchor &&
          href
        ) {
          anchor.href =
            href;

          anchor.target =
            '_blank';

          anchor.rel =
            'noopener noreferrer';
        }
      }
    );
  }

  // ------------------------------------------------------------
  // Dropdown open/close behavior
  // ------------------------------------------------------------

  function closeMenu() {
    const widget =
      document.getElementById(
        WIDGET_ID
      );

    const menu =
      document.getElementById(
        MENU_ID
      );

    const button =
      widget?.querySelector(
        '.tns-cql-button'
      );

    menu?.classList.remove(
      'tns-cql-open'
    );

    button?.setAttribute(
      'aria-expanded',
      'false'
    );
  }

  function positionMenu(
    button,
    menu
  ) {
    const rect =
      button.getBoundingClientRect();

    const gap = 4;

    menu.style.visibility =
      'hidden';

    menu.classList.add(
      'tns-cql-open'
    );

    const menuRect =
      menu.getBoundingClientRect();

    const maxLeft =
      Math.max(
        8,
        innerWidth -
          menuRect.width -
          8
      );

    const left =
      Math.min(
        Math.max(
          8,
          rect.left
        ),
        maxLeft
      );

    let top =
      rect.bottom +
      gap;

    if (
      top +
        menuRect.height >
      innerHeight -
        8
    ) {
      top =
        Math.max(
          8,
          rect.top -
            menuRect.height -
            gap
        );
    }

    menu.style.left =
      `${Math.round(
        left
      )}px`;

    menu.style.top =
      `${Math.round(
        top
      )}px`;

    menu.style.visibility =
      '';
  }

  function toggleMenu(
    button,
    menu
  ) {
    if (
      menu.classList.contains(
        'tns-cql-open'
      )
    ) {
      closeMenu();
      return;
    }

    positionMenu(
      button,
      menu
    );

    button.setAttribute(
      'aria-expanded',
      'true'
    );
  }

  // ------------------------------------------------------------
  // Create widget
  // ------------------------------------------------------------

  function createWidget(
    customer
  ) {
    const menu =
      createMenu(
        buildFallbackLinks(
          customer
        )
      );

    const widget =
      document.createElement(
        'span'
      );

    widget.id =
      WIDGET_ID;

    widget.dataset.customerId =
      customer.id;

    const button =
      document.createElement(
        'button'
      );

    button.type =
      'button';

    button.className =
      'tns-cql-button';

    button.setAttribute(
      'aria-haspopup',
      'true'
    );

    button.setAttribute(
      'aria-expanded',
      'false'
    );

    button.title =
      customer.name
        ? `Quick links for ${customer.name}`
        : 'Customer quick links';

    const label =
      document.createElement(
        'span'
      );

    label.textContent =
      'Customer';

    const caret =
      document.createElement(
        'span'
      );

    caret.className =
      'tns-cql-caret';

    caret.textContent =
      '▼';

    button.append(
      label,
      caret
    );

    widget.appendChild(
      button
    );

    let discoveryStarted =
      false;

    function startDiscovery() {
      if (
        discoveryStarted
      ) {
        return;
      }

      discoveryStarted =
        true;

      discoverCustomerLinks(
        customer
      )
        .then(
          (
            links
          ) => {
            if (
              widget.isConnected &&
              widget.dataset
                .customerId ===
                customer.id
            ) {
              applyLinks(
                menu,
                links
              );
            }
          }
        )
        .catch(
          (
            error
          ) => {
            console.debug(
              '[TNS Customer Quick Links] Could not update discovered links.',
              error
            );
          }
        );
    }

    button.addEventListener(
      'click',
      (
        event
      ) => {
        event.preventDefault();
        event.stopPropagation();

        /*
         * Begin fetching Syncro's native customer-specific
         * links as soon as the dropdown is opened.
         */
        startDiscovery();

        toggleMenu(
          button,
          menu
        );
      }
    );

    /*
     * Start early when possible so the native links are
     * normally ready before the user clicks an item.
     */
    button.addEventListener(
      'mouseenter',
      startDiscovery,
      {
        once: true
      }
    );

    button.addEventListener(
      'focus',
      startDiscovery,
      {
        once: true
      }
    );

    menu.addEventListener(
      'click',
      closeMenu
    );

    return widget;
  }

  // ------------------------------------------------------------
  // Mount
  // ------------------------------------------------------------

  function mount() {
    ensureStyles();

    const customer =
      getCustomerInfo();

    if (!customer) {
      return false;
    }

    const existing =
      document.getElementById(
        WIDGET_ID
      );

    if (
      existing?.isConnected &&
      existing.dataset
        .customerId ===
        customer.id
    ) {
      return true;
    }

    existing?.remove();

    document
      .getElementById(
        MENU_ID
      )
      ?.remove();

    const widget =
      createWidget(
        customer
      );

    customer.anchor
      .insertAdjacentElement(
        'afterend',
        widget
      );

    return true;
  }

  // ------------------------------------------------------------
  // Close dropdown
  // ------------------------------------------------------------

  document.addEventListener(
    'click',
    (
      event
    ) => {
      const widget =
        document.getElementById(
          WIDGET_ID
        );

      const menu =
        document.getElementById(
          MENU_ID
        );

      if (
        !widget?.contains(
          event.target
        ) &&
        !menu?.contains(
          event.target
        )
      ) {
        closeMenu();
      }
    }
  );

  document.addEventListener(
    'keydown',
    (
      event
    ) => {
      if (
        event.key ===
        'Escape'
      ) {
        closeMenu();
      }
    }
  );

  addEventListener(
    'resize',
    closeMenu
  );

  addEventListener(
    'scroll',
    closeMenu,
    true
  );

  // ------------------------------------------------------------
  // Initial mount + Syncro rerender protection
  // ------------------------------------------------------------

  mount();

  let mountTimer =
    null;

  const observer =
    new MutationObserver(
      () => {
        clearTimeout(
          mountTimer
        );

        mountTimer =
          setTimeout(
            mount,
            150
          );
      }
    );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );
})();
