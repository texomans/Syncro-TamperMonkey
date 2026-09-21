// ==UserScript==
// @name         Syncro Tickets - Customer Quick Links
// @namespace    https://texomans.com/
// @version      1.0.2
// @description  Adds customer quick links to Syncro ticket pages. Opens Customer Page, All Tickets, Assets, and End Users in new tabs.
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
  // Find the ticket's customer
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
  // Build customer links
  // ------------------------------------------------------------

  function buildBaseLinks(customer) {
    const customerPage =
      new URL(
        `/customers/${customer.id}`,
        location.origin
      );

    const allTickets =
      new URL(
        '/tickets',
        location.origin
      );

    allTickets.searchParams.set(
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
     * Syncro's End Users / Contacts tab lives directly on
     * the customer page using the #contacts hash.
     *
     * Example:
     * /customers/4649389#contacts
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
        allTickets.href,

      assets:
        assets.href,

      contacts:
        endUsers.href
    };
  }

  // ------------------------------------------------------------
  // Asset link discovery
  //
  // Syncro's customer page sometimes provides a more native
  // customer-specific Assets link. We keep discovery for Assets,
  // but Contacts/End Users is now explicitly /customers/ID#contacts.
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
      1400
    );
  }

  function scoreAssetLink(
    anchor,
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
      score += 45;
    }

    if (
      /view all|see all/.test(
        text
      )
    ) {
      score += 20;
    }

    if (
      /^\/customer_assets\/?$/.test(
        path
      )
    ) {
      score += 55;
    } else if (
      customerInPath &&
      /asset/.test(path)
    ) {
      score += 40;
    } else {
      return -Infinity;
    }

    if (
      /assets?/.test(
        context
      )
    ) {
      score += 15;
    }

    return score;
  }

  function findNativeAssetLink(
    doc,
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
              scoreAssetLink(
                anchor,
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

  function ensureCustomerFilter(
    urlValue,
    customerId
  ) {
    const url =
      new URL(
        urlValue,
        location.origin
      );

    const hasCustomerFilter =
      Array.from(
        url.searchParams.keys()
      ).some(
        (key) =>
          /customer.*id|organization.*id/i.test(
            key
          )
      );

    const hasCustomerInPath =
      new RegExp(
        `/customers/${customerId}(?:/|$)`,
        'i'
      ).test(
        url.pathname
      );

    if (
      !hasCustomerFilter &&
      !hasCustomerInPath
    ) {
      url.searchParams.set(
        'customer_id',
        customerId
      );
    }

    return url.href;
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

    const baseLinks =
      buildBaseLinks(
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

            const nativeAssets =
              findNativeAssetLink(
                doc,
                customer.id
              );

            return {
              customer:
                baseLinks.customer,

              tickets:
                baseLinks.tickets,

              assets:
                nativeAssets
                  ? ensureCustomerFilter(
                      nativeAssets,
                      customer.id
                    )
                  : baseLinks.assets,

              contacts:
                baseLinks.contacts
            };
          }
        )
        .catch(
          (
            error
          ) => {
            console.debug(
              '[TNS Customer Quick Links] Customer page discovery failed; using direct links.',
              error
            );

            return baseLinks;
          }
        );

    customerPageCache.set(
      customer.id,
      promise
    );

    return promise;
  }

  // ------------------------------------------------------------
  // Styling
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
  // Dropdown
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
         * Always preserve the original ticket page.
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
  // Widget
  // ------------------------------------------------------------

  function createWidget(
    customer
  ) {
    const menu =
      createMenu(
        buildBaseLinks(
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

        startDiscovery();

        toggleMenu(
          button,
          menu
        );
      }
    );

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
  // Close behavior
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
  // Initial mount and Syncro rerender protection
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
