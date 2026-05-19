// ==UserScript==
// @name         Syncro Assets List - Add RustDesk to Remote Access Dropdown
// @namespace    https://texomans.com/
// @version      1.0.0
// @description  Adds RustDesk to each asset row's Remote Access dropdown on the Syncro assets list page.
// @match        https://*.syncromsp.com/customer_assets*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const RUSTDESK_ITEM_ATTR = 'data-tns-rustdesk-assets-index-menu-item';

  function isAssetsIndexPage() {
    return (
      document.body?.dataset?.currentPage === 'assets-index' ||
      !!document.querySelector('table[data-testid="assets-table"]')
    );
  }

  function normalizeUrl(value, base = window.location.origin) {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';

    try {
      return new URL(trimmed, base).href;
    } catch {
      return '';
    }
  }

  function findValueByKey(object, targetKey) {
    if (!object || typeof object !== 'object') return '';

    if (Object.prototype.hasOwnProperty.call(object, targetKey)) {
      return object[targetKey] || '';
    }

    for (const value of Object.values(object)) {
      const found = findValueByKey(value, targetKey);
      if (found) return found;
    }

    return '';
  }

  function getAssetIdFromRow(row) {
    const rowTestId = row.getAttribute('data-testid') || '';
    const rowMatch = rowTestId.match(/^asset-row-(\d+)$/);
    if (rowMatch) return rowMatch[1];

    const checkbox = row.querySelector('input.selectedId[value]');
    if (checkbox?.value) return checkbox.value;

    const assetLink = row.querySelector('a[href^="/customer_assets/"], a[href*="/customer_assets/"]');
    if (assetLink?.href) {
      const parsed = new URL(assetLink.href, window.location.origin);
      const linkMatch = parsed.pathname.match(/^\/customer_assets\/(\d+)\/?$/);
      if (linkMatch) return linkMatch[1];
    }

    return '';
  }

  function getRustDeskLinkFromRow(row) {
    const propNodes = row.querySelectorAll('[data-react-props], [data-props]');

    for (const node of propNodes) {
      const raw =
        node.getAttribute('data-react-props') ||
        node.getAttribute('data-props') ||
        '';

      if (!raw.includes('RustDesk Link')) continue;

      try {
        const props = JSON.parse(raw);
        const rustDeskLink = normalizeUrl(findValueByKey(props, 'RustDesk Link'));

        if (rustDeskLink) return rustDeskLink;
      } catch {
        // Ignore invalid JSON blocks.
      }
    }

    return '';
  }

  function getRemoteAccessWrapper(row, assetId) {
    const remoteButton =
      row.querySelector(`a.btn-remote-access[href*="/customer_assets/${assetId}/remote_access"]`) ||
      row.querySelector(`a[href*="/customer_assets/${assetId}/remote_access"]`) ||
      row.querySelector('a.btn-remote-access');

    if (!remoteButton) return null;

    return (
      remoteButton.closest('.btn-group[style*="min-width"]') ||
      remoteButton.closest('.btn-group') ||
      remoteButton.parentElement
    );
  }

  function getOrCreateRemoteAccessMenu(wrapper) {
    let menu = wrapper.querySelector('ul.dropdown-menu');
    if (menu) return menu;

    const remoteButton =
      wrapper.querySelector('a.btn-remote-access') ||
      wrapper.querySelector('a[href*="/remote_access"]') ||
      wrapper.querySelector('a.btn');

    if (!remoteButton) return null;

    const dropdownGroup = document.createElement('div');
    dropdownGroup.className = 'btn-group';
    dropdownGroup.innerHTML = `
      <a class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown" href="#">
        &nbsp;<span class="caret"></span>
      </a>
      <ul class="dropdown-menu dropdown-menu-right"></ul>
    `;

    remoteButton.insertAdjacentElement('afterend', dropdownGroup);

    return dropdownGroup.querySelector('ul.dropdown-menu');
  }

  function findScreenConnectItem(menu) {
    return Array.from(menu.querySelectorAll('li')).find((li) =>
      /screenconnect/i.test(li.textContent || '')
    );
  }

  function removeExistingRustDeskItem(wrapper) {
    wrapper
      ?.querySelectorAll(`li[${RUSTDESK_ITEM_ATTR}]`)
      .forEach((item) => item.remove());
  }

  function addRustDeskToRow(row) {
    const assetId = getAssetIdFromRow(row);
    if (!assetId) return;

    const wrapper = getRemoteAccessWrapper(row, assetId);
    if (!wrapper) return;

    removeExistingRustDeskItem(wrapper);

    const rustDeskUrl = getRustDeskLinkFromRow(row);

    if (!rustDeskUrl) {
      return;
    }

    const menu = getOrCreateRemoteAccessMenu(wrapper);
    if (!menu) return;

    const rustDeskItem = document.createElement('li');
    rustDeskItem.setAttribute(RUSTDESK_ITEM_ATTR, 'true');
    rustDeskItem.setAttribute('data-asset-id', assetId);

    const rustDeskAnchor = document.createElement('a');
    rustDeskAnchor.href = rustDeskUrl;
    rustDeskAnchor.target = '_blank';
    rustDeskAnchor.rel = 'noopener noreferrer';
    rustDeskAnchor.textContent = 'RustDesk';

    rustDeskItem.appendChild(rustDeskAnchor);

    const screenConnectItem = findScreenConnectItem(menu);

    if (screenConnectItem) {
      menu.insertBefore(rustDeskItem, screenConnectItem);
    } else {
      menu.insertBefore(rustDeskItem, menu.firstElementChild);
    }
  }

  function processAssetRows() {
    if (!isAssetsIndexPage()) return;

    const rows = document.querySelectorAll(
      'tr[data-testid^="asset-row-"], table[data-testid="assets-table"] tbody tr'
    );

    rows.forEach(addRustDeskToRow);
  }

  let pending = false;

  function scheduleProcessAssetRows() {
    if (pending) return;

    pending = true;

    window.setTimeout(() => {
      pending = false;
      processAssetRows();
    }, 300);
  }

  scheduleProcessAssetRows();
  window.addEventListener('load', scheduleProcessAssetRows);

  const observer = new MutationObserver(scheduleProcessAssetRows);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
