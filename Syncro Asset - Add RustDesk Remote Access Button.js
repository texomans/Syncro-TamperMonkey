// ==UserScript==
// @name         Syncro Asset - Add RustDesk Remote Access Button
// @namespace    https://www.texomans.com/
// @version      1.1.0
// @description  Adds RustDesk to Syncro asset pages. Uses a Remote Access dropdown when Syncro Remote Access exists, or a direct RustDesk button when it does not.
// @match        https://*.syncromsp.com/customer_assets/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Asset%20-%20Add%20RustDesk%20Remote%20Access%20Button.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Asset%20-%20Add%20RustDesk%20Remote%20Access%20Button.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const RUSTDESK_ITEM_ATTR = 'data-tns-rustdesk-menu-item';
  const RUSTDESK_DROPDOWN_ATTR = 'data-tns-rustdesk-remote-dropdown';
  const RUSTDESK_DIRECT_ATTR = 'data-tns-rustdesk-direct-button';
  const RUSTDESK_DIRECT_GROUP_ATTR = 'data-tns-rustdesk-direct-group';

  function normalizeUrl(value) {
    const trimmed = (value || '').trim();

    if (!trimmed) return '';

    try {
      const url = new URL(trimmed, window.location.origin);

      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        return '';
      }

      return url.href;
    } catch {
      return '';
    }
  }

  function getRustDeskLinkFromCustomField() {
    const fieldCell = document.querySelector('td[data-testid="RustDesk Link"]');
    if (!fieldCell) return '';

    const anchor = fieldCell.querySelector('a[href]');

    if (anchor?.href) {
      return normalizeUrl(anchor.href);
    }

    return normalizeUrl(fieldCell.textContent);
  }

  function getRustDeskLinkFromReactProps() {
    const propNodes = document.querySelectorAll('[data-react-props]');

    for (const node of propNodes) {
      const raw = node.getAttribute('data-react-props');

      if (!raw || !raw.includes('RustDesk Link')) {
        continue;
      }

      try {
        const props = JSON.parse(raw);

        const candidates = [
          props?.asset?.properties?.['RustDesk Link'],
          props?.asset?.new_properties?.['RustDesk Link'],
          props?.properties?.['RustDesk Link'],
          props?.new_properties?.['RustDesk Link']
        ];

        for (const candidate of candidates) {
          const normalized = normalizeUrl(candidate);

          if (normalized) {
            return normalized;
          }
        }
      } catch {
        // Ignore nodes that are not valid JSON.
      }
    }

    return '';
  }

  function getRustDeskLink() {
    return (
      getRustDeskLinkFromCustomField() ||
      getRustDeskLinkFromReactProps()
    );
  }

  function getNativeRemoteAccessButton() {
    return document.querySelector('.btn-remote-access');
  }

  function getBackgroundingToolsButton() {
    const buttons = document.querySelectorAll('.btn-bar a.btn');

    return Array.from(buttons).find((button) =>
      /backgrounding\s+tools/i.test(button.textContent || '')
    ) || null;
  }

  function getButtonBar() {
    const remoteButton = getNativeRemoteAccessButton();

    if (remoteButton) {
      const bar = remoteButton.closest('.btn-bar');
      if (bar) return bar;
    }

    const backgroundButton = getBackgroundingToolsButton();

    if (backgroundButton) {
      const bar = backgroundButton.closest('.btn-bar');
      if (bar) return bar;
    }

    return document.querySelector('.btn-bar');
  }

  /*
   * If Syncro itself ever puts a dropdown immediately after
   * Remote Access, this detects that dropdown specifically.
   *
   * It deliberately does NOT search the entire outer btn-group,
   * which is what caused RustDesk to end up under Backgrounding Tools.
   */
  function getNativeRemoteAccessMenu(remoteButton) {
    const next = remoteButton.nextElementSibling;

    if (!next) return null;

    if (!next.matches('.btn-group')) {
      return null;
    }

    if (next.hasAttribute(RUSTDESK_DROPDOWN_ATTR)) {
      return null;
    }

    const toggle = next.querySelector(
      ':scope > .dropdown-toggle'
    );

    const menu = next.querySelector(
      ':scope > ul.dropdown-menu'
    );

    if (!toggle || !menu) {
      return null;
    }

    return menu;
  }

  function findScreenConnectItem(menu) {
    return Array.from(menu.querySelectorAll(':scope > li')).find((li) =>
      /screen\s*connect/i.test(li.textContent || '')
    ) || null;
  }

  function removeRustDeskMenuItemsExcept(keepItem = null) {
    document
      .querySelectorAll(`li[${RUSTDESK_ITEM_ATTR}]`)
      .forEach((item) => {
        if (item !== keepItem) {
          item.remove();
        }
      });
  }

  function removeCustomRemoteDropdown() {
    document
      .querySelectorAll(`[${RUSTDESK_DROPDOWN_ATTR}]`)
      .forEach((element) => element.remove());
  }

  function removeDirectRustDeskButton() {
    document
      .querySelectorAll(`[${RUSTDESK_DIRECT_ATTR}]`)
      .forEach((element) => element.remove());

    document
      .querySelectorAll(`[${RUSTDESK_DIRECT_GROUP_ATTR}]`)
      .forEach((group) => {
        if (!group.children.length) {
          group.remove();
        }
      });
  }

  function removeAllRustDeskControls() {
    removeRustDeskMenuItemsExcept();
    removeCustomRemoteDropdown();
    removeDirectRustDeskButton();

    document
      .querySelectorAll(`[${RUSTDESK_DIRECT_GROUP_ATTR}]`)
      .forEach((element) => element.remove());
  }

  function getOrCreateRustDeskDropdown(remoteButton) {
    let dropdownGroup = document.querySelector(
      `[${RUSTDESK_DROPDOWN_ATTR}]`
    );

    if (!dropdownGroup) {
      dropdownGroup = document.createElement('div');
      dropdownGroup.className = 'btn-group';
      dropdownGroup.setAttribute(RUSTDESK_DROPDOWN_ATTR, 'true');

      dropdownGroup.innerHTML = `
        <a
          class="btn btn-default btn-sm dropdown-toggle"
          data-toggle="dropdown"
          href="#"
          aria-label="Remote Access options"
          title="Remote Access options"
        >
          &nbsp;<span class="caret"></span>
        </a>
        <ul class="dropdown-menu dropdown-menu-right"></ul>
      `;
    }

    /*
     * Critical part:
     *
     * The RustDesk dropdown goes IMMEDIATELY AFTER Remote Access,
     * not at the end of the surrounding btn-group.
     */
    if (remoteButton.nextElementSibling !== dropdownGroup) {
      remoteButton.insertAdjacentElement('afterend', dropdownGroup);
    }

    return dropdownGroup.querySelector(':scope > ul.dropdown-menu');
  }

  function getOrCreateRustDeskMenuItem(menu, rustDeskUrl) {
    let item = menu.querySelector(
      `:scope > li[${RUSTDESK_ITEM_ATTR}]`
    );

    if (!item) {
      item = document.createElement('li');
      item.setAttribute(RUSTDESK_ITEM_ATTR, 'true');

      const link = document.createElement('a');
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      link.textContent = 'RustDesk';

      item.appendChild(link);
    }

    const link = item.querySelector('a');

    if (link) {
      link.href = rustDeskUrl;
    }

    /*
     * Preserve the old behavior:
     * if a Remote Access menu contains ScreenConnect,
     * put RustDesk immediately before it.
     */
    const screenConnectItem = findScreenConnectItem(menu);

    if (screenConnectItem) {
      if (screenConnectItem.previousElementSibling !== item) {
        menu.insertBefore(item, screenConnectItem);
      }
    } else if (menu.firstElementChild !== item) {
      menu.insertBefore(item, menu.firstElementChild);
    }

    return item;
  }

  function configureRemoteAccessDropdown(remoteButton, rustDeskUrl) {
    /*
     * When Syncro Remote Access exists:
     *
     *   Remote Access [▼]  Backgrounding Tools [▼]
     *
     * RustDesk belongs to the dropdown directly beside
     * Remote Access.
     */

    removeDirectRustDeskButton();

    let menu = getNativeRemoteAccessMenu(remoteButton);

    if (menu) {
      /*
       * Syncro already supplied a Remote Access dropdown,
       * so use it and remove our custom dropdown if one exists.
       */
      removeCustomRemoteDropdown();
    } else {
      /*
       * Syncro Remote Access is a standalone button.
       * Create our own split-dropdown immediately after it.
       */
      menu = getOrCreateRustDeskDropdown(remoteButton);
    }

    if (!menu) return;

    const rustDeskItem = getOrCreateRustDeskMenuItem(
      menu,
      rustDeskUrl
    );

    /*
     * Also cleans up RustDesk if an older version of this script
     * accidentally left it inside Backgrounding Tools.
     */
    removeRustDeskMenuItemsExcept(rustDeskItem);
  }

  function configureDirectRustDeskButton(rustDeskUrl) {
    /*
     * When Syncro's own Remote Access is NOT present:
     *
     *   RustDesk  Backgrounding Tools [▼]
     */

    removeCustomRemoteDropdown();
    removeRustDeskMenuItemsExcept();

    const backgroundButton = getBackgroundingToolsButton();
    const buttonBar = getButtonBar();

    if (!backgroundButton && !buttonBar) {
      return;
    }

    let rustDeskButton = document.querySelector(
      `[${RUSTDESK_DIRECT_ATTR}]`
    );

    if (!rustDeskButton) {
      rustDeskButton = document.createElement('a');
      rustDeskButton.className = 'btn btn-default btn-sm';
      rustDeskButton.setAttribute(RUSTDESK_DIRECT_ATTR, 'true');
      rustDeskButton.target = '_blank';
      rustDeskButton.rel = 'noopener noreferrer';

      rustDeskButton.innerHTML =
        '<i class="fas fa-desktop"></i>&nbsp;RustDesk';
    }

    rustDeskButton.href = rustDeskUrl;

    if (backgroundButton?.parentElement) {
      /*
       * Put the direct RustDesk button where Remote Access
       * normally appears: immediately before Backgrounding Tools.
       */
      if (
        rustDeskButton.parentElement !== backgroundButton.parentElement ||
        rustDeskButton.nextElementSibling !== backgroundButton
      ) {
        backgroundButton.parentElement.insertBefore(
          rustDeskButton,
          backgroundButton
        );
      }

      document
        .querySelectorAll(`[${RUSTDESK_DIRECT_GROUP_ATTR}]`)
        .forEach((group) => {
          if (!group.children.length) {
            group.remove();
          }
        });

      return;
    }

    /*
     * Fallback in case Syncro someday removes Backgrounding Tools too.
     */
    let group = document.querySelector(
      `[${RUSTDESK_DIRECT_GROUP_ATTR}]`
    );

    if (!group) {
      group = document.createElement('div');
      group.className = 'btn-group';
      group.setAttribute(RUSTDESK_DIRECT_GROUP_ATTR, 'true');

      buttonBar.prepend(group);
    }

    if (rustDeskButton.parentElement !== group) {
      group.appendChild(rustDeskButton);
    }
  }

  function updateRustDeskControls() {
    const rustDeskUrl = getRustDeskLink();

    if (!rustDeskUrl) {
      removeAllRustDeskControls();
      return;
    }

    const remoteButton = getNativeRemoteAccessButton();

    if (remoteButton) {
      configureRemoteAccessDropdown(
        remoteButton,
        rustDeskUrl
      );
    } else {
      configureDirectRustDeskButton(rustDeskUrl);
    }
  }

  let pending = false;

  function scheduleUpdate() {
    if (pending) return;

    pending = true;

    window.setTimeout(() => {
      pending = false;
      updateRustDeskControls();
    }, 250);
  }

  /*
   * Initial run.
   */
  scheduleUpdate();

  /*
   * Syncro dynamically changes portions of the page,
   * so retry after full load as well.
   */
  window.addEventListener('load', scheduleUpdate);

  /*
   * Catch AJAX / React DOM changes without constantly
   * rebuilding our controls.
   */
  const observer = new MutationObserver(scheduleUpdate);

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
