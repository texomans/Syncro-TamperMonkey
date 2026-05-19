// ==UserScript==
// @name         Syncro - Add RustDesk Remote Access Button
// @namespace    https://texomans.com/
// @version      1.0.0
// @description  Adds RustDesk to the Remote Access dropdown on Syncro asset pages when the RustDesk Link custom field is populated.
// @match        https://*.syncromsp.com/customer_assets/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const RUSTDESK_ITEM_ATTR = 'data-tns-rustdesk-menu-item';

  function normalizeUrl(value) {
    const trimmed = (value || '').trim();

    if (!trimmed) return '';

    try {
      return new URL(trimmed, window.location.origin).href;
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
      if (!raw || !raw.includes('RustDesk Link')) continue;

      try {
        const props = JSON.parse(raw);
        const link =
          props?.asset?.properties?.['RustDesk Link'] ||
          props?.asset?.new_properties?.['RustDesk Link'];

        const normalized = normalizeUrl(link);
        if (normalized) return normalized;
      } catch {
        // Ignore nodes that are not valid JSON.
      }
    }

    return '';
  }

  function getRustDeskLink() {
    return getRustDeskLinkFromCustomField() || getRustDeskLinkFromReactProps();
  }

  function getRemoteAccessWrapper() {
    const remoteButton = document.querySelector('a.btn-remote-access');
    if (!remoteButton) return null;

    return remoteButton.closest('.btn-group') || remoteButton.parentElement;
  }

  function getOrCreateRemoteAccessMenu(wrapper) {
    let menu = wrapper.querySelector('ul.dropdown-menu');
    if (menu) return menu;

    const dropdownGroup = document.createElement('div');
    dropdownGroup.className = 'btn-group';
    dropdownGroup.innerHTML = `
      <a class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown" href="#">
        &nbsp;<span class="caret"></span>
      </a>
      <ul class="dropdown-menu dropdown-menu-right"></ul>
    `;

    wrapper.appendChild(dropdownGroup);
    return dropdownGroup.querySelector('ul.dropdown-menu');
  }

  function findScreenConnectItem(menu) {
    return Array.from(menu.querySelectorAll('li')).find((li) =>
      /screenconnect/i.test(li.textContent || '')
    );
  }

  function removeExistingRustDeskItems() {
    document.querySelectorAll(`li[${RUSTDESK_ITEM_ATTR}]`).forEach((item) => {
      item.remove();
    });
  }

  function addRustDeskMenuItem() {
    const rustDeskUrl = getRustDeskLink();

    if (!rustDeskUrl) {
      removeExistingRustDeskItems();
      return;
    }

    const wrapper = getRemoteAccessWrapper();
    if (!wrapper) return;

    const menu = getOrCreateRemoteAccessMenu(wrapper);
    if (!menu) return;

    const existing = menu.querySelector(`li[${RUSTDESK_ITEM_ATTR}]`);
    const existingHref = existing?.querySelector('a[href]')?.href;

    if (existing && existingHref === rustDeskUrl) {
      const screenConnectItem = findScreenConnectItem(menu);

      if (screenConnectItem && screenConnectItem.previousElementSibling !== existing) {
        menu.insertBefore(existing, screenConnectItem);
      } else if (!screenConnectItem && menu.firstElementChild !== existing) {
        menu.insertBefore(existing, menu.firstElementChild);
      }

      return;
    }

    removeExistingRustDeskItems();

    const rustDeskItem = document.createElement('li');
    rustDeskItem.setAttribute(RUSTDESK_ITEM_ATTR, 'true');

    const rustDeskLink = document.createElement('a');
    rustDeskLink.href = rustDeskUrl;
    rustDeskLink.target = '_blank';
    rustDeskLink.rel = 'noopener noreferrer';
    rustDeskLink.textContent = 'RustDesk';

    rustDeskItem.appendChild(rustDeskLink);

    const screenConnectItem = findScreenConnectItem(menu);

    if (screenConnectItem) {
      menu.insertBefore(rustDeskItem, screenConnectItem);
    } else {
      menu.insertBefore(rustDeskItem, menu.firstElementChild);
    }
  }

  let pending = false;

  function scheduleAddRustDeskMenuItem() {
    if (pending) return;

    pending = true;

    window.setTimeout(() => {
      pending = false;
      addRustDeskMenuItem();
    }, 250);
  }

  scheduleAddRustDeskMenuItem();

  window.addEventListener('load', scheduleAddRustDeskMenuItem);

  const observer = new MutationObserver(scheduleAddRustDeskMenuItem);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
