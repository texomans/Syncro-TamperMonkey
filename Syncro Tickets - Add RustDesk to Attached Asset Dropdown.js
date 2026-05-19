// ==UserScript==
// @name         Syncro Tickets - Add RustDesk to Ticket Attached Asset Dropdown
// @namespace    https://texomans.com/
// @version      1.0.0
// @description  Adds RustDesk to attached asset remote-access dropdowns on Syncro ticket pages.
// @match        https://*.syncromsp.com/tickets/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const RUSTDESK_ITEM_ATTR = 'data-tns-rustdesk-ticket-menu-item';
  const ASSET_LINK_SELECTOR = 'a[href*="/customer_assets/"]';
  const assetLinkCache = new Map();

  function normalizeUrl(value, base = window.location.origin) {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';

    try {
      return new URL(trimmed, base).href;
    } catch {
      return '';
    }
  }

  function decodeHtml(value) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = value || '';
    return textarea.value;
  }

  function getAssetIdFromUrl(url) {
    try {
      const parsed = new URL(url, window.location.origin);
      const match = parsed.pathname.match(/^\/customer_assets\/(\d+)\/?$/);
      return match ? match[1] : '';
    } catch {
      return '';
    }
  }

  function isAssetViewLink(anchor) {
    if (!anchor?.href) return false;

    try {
      const url = new URL(anchor.href, window.location.origin);
      return /^\/customer_assets\/\d+\/?$/.test(url.pathname);
    } catch {
      return false;
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

  function getRustDeskLinkFromAssetDocument(assetDoc, rawHtml = '') {
    const fieldCell = assetDoc.querySelector('td[data-testid="RustDesk Link"]');

    if (fieldCell) {
      const anchor = fieldCell.querySelector('a[href]');
      if (anchor?.href) return normalizeUrl(anchor.href);

      const textUrl = normalizeUrl(fieldCell.textContent);
      if (textUrl) return textUrl;
    }

    const propNodes = assetDoc.querySelectorAll('[data-react-props], [data-props]');

    for (const node of propNodes) {
      const raw =
        node.getAttribute('data-react-props') ||
        node.getAttribute('data-props') ||
        '';

      if (!raw.includes('RustDesk Link')) continue;

      try {
        const props = JSON.parse(raw);
        const found = normalizeUrl(findValueByKey(props, 'RustDesk Link'));
        if (found) return found;
      } catch {
        // Ignore invalid JSON blocks.
      }
    }

    const regexMatch = rawHtml.match(
      /(?:&quot;|")RustDesk Link(?:&quot;|")\s*:?\s*(?:&quot;|")([^"&]+)(?:&quot;|")/
    );

    if (regexMatch?.[1]) {
      return normalizeUrl(decodeHtml(regexMatch[1]));
    }

    return '';
  }

  async function fetchRustDeskLinkFromAsset(assetUrl) {
    const normalizedAssetUrl = normalizeUrl(assetUrl);

    if (!normalizedAssetUrl) return '';

    if (assetLinkCache.has(normalizedAssetUrl)) {
      return await assetLinkCache.get(normalizedAssetUrl);
    }

    const promise = fetch(normalizedAssetUrl, {
      method: 'GET',
      credentials: 'same-origin'
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Asset page returned HTTP ${response.status}`);
        }

        const html = await response.text();
        const assetDoc = new DOMParser().parseFromString(html, 'text/html');

        return getRustDeskLinkFromAssetDocument(assetDoc, html);
      })
      .catch((error) => {
        console.warn('[RustDesk Ticket Button] Could not fetch asset page:', normalizedAssetUrl, error);
        return '';
      });

    assetLinkCache.set(normalizedAssetUrl, promise);

    return await promise;
  }

  function getNameCell(assetLink) {
    return assetLink.closest('td, [role="cell"], .MuiTableCell-root');
  }

  function getRemoteCell(assetLink) {
    const nameCell = getNameCell(assetLink);

    if (nameCell?.nextElementSibling) {
      return nameCell.nextElementSibling;
    }

    const row = assetLink.closest('tr, [role="row"], .MuiTableRow-root');
    if (!row) return null;

    return (
      row.querySelector('td a[href*="/remote_access"]')?.closest('td, [role="cell"], .MuiTableCell-root') ||
      row.querySelector('td .dropdown-toggle')?.closest('td, [role="cell"], .MuiTableCell-root') ||
      null
    );
  }

  function removeExistingRustDeskItem(remoteCell) {
    remoteCell
      ?.querySelectorAll(`li[${RUSTDESK_ITEM_ATTR}]`)
      .forEach((item) => item.remove());
  }

  function findScreenConnectItem(menu) {
    return Array.from(menu.querySelectorAll('li')).find((li) =>
      /screenconnect/i.test(li.textContent || '')
    );
  }

  function getOrCreateDropdownMenu(remoteCell, assetId) {
    let menu = remoteCell.querySelector('ul.dropdown-menu');
    if (menu) return menu;

    const remoteButton =
      remoteCell.querySelector(`a[href*="/customer_assets/${assetId}/remote_access"]`) ||
      remoteCell.querySelector('a[href*="/remote_access"]') ||
      remoteCell.querySelector('.btn');

    if (!remoteButton) return null;

    const dropdownGroup = document.createElement('div');
    dropdownGroup.className = 'btn-group';
    dropdownGroup.innerHTML = `
      <a class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown" href="#">
        &nbsp;<span class="caret"></span>
      </a>
      <ul class="dropdown-menu dropdown-menu-right"></ul>
    `;

    const parentGroup = remoteButton.closest('.btn-group');

    if (parentGroup) {
      parentGroup.appendChild(dropdownGroup);
    } else {
      remoteButton.insertAdjacentElement('afterend', dropdownGroup);
    }

    return dropdownGroup.querySelector('ul.dropdown-menu');
  }

  function addRustDeskToRemoteDropdown(assetLink, rustDeskUrl) {
    const assetId = getAssetIdFromUrl(assetLink.href);
    if (!assetId) return;

    const remoteCell = getRemoteCell(assetLink);
    if (!remoteCell) return;

    removeExistingRustDeskItem(remoteCell);

    if (!rustDeskUrl) return;

    const menu = getOrCreateDropdownMenu(remoteCell, assetId);
    if (!menu) return;

    const rustDeskItem = document.createElement('li');
    rustDeskItem.setAttribute(RUSTDESK_ITEM_ATTR, 'true');

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

  function getAttachedAssetLinks() {
    const uniqueLinks = new Map();

    document.querySelectorAll(ASSET_LINK_SELECTOR).forEach((anchor) => {
      if (!isAssetViewLink(anchor)) return;

      const assetId = getAssetIdFromUrl(anchor.href);
      if (!assetId) return;

      const row = anchor.closest('tr, [role="row"], .MuiTableRow-root');
      if (!row) return;

      const remoteCell = getRemoteCell(anchor);
      if (!remoteCell) return;

      uniqueLinks.set(assetId, anchor);
    });

    return Array.from(uniqueLinks.values());
  }

  async function processAttachedAssets() {
    const assetLinks = getAttachedAssetLinks();

    for (const assetLink of assetLinks) {
      const rustDeskUrl = await fetchRustDeskLinkFromAsset(assetLink.href);
      addRustDeskToRemoteDropdown(assetLink, rustDeskUrl);
    }
  }

  let pending = false;

  function scheduleProcessAttachedAssets() {
    if (pending) return;

    pending = true;

    window.setTimeout(() => {
      pending = false;
      processAttachedAssets();
    }, 500);
  }

  scheduleProcessAttachedAssets();
  window.addEventListener('load', scheduleProcessAttachedAssets);

  const observer = new MutationObserver(scheduleProcessAttachedAssets);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
