// ==UserScript==
// @name         Syncro Chat - Add RustDesk to Asset Remote Dropdown
// @namespace    https://texomans.com/
// @version      1.0.0
// @description  Adds RustDesk to the asset Remote Access dropdown on Syncro chat pages.
// @match        https://*.syncromsp.com/chat
// @match        https://*.syncromsp.com/chat/*
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const RUSTDESK_ITEM_ATTR = 'data-tns-rustdesk-chat-menu-item';
  const rustDeskLinkCache = new Map();

  function normalizeUrl(value, base = window.location.origin) {
    const trimmed = (value || '').trim();
    if (!trimmed) return '';

    try {
      return new URL(trimmed, base).href;
    } catch {
      return '';
    }
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
    return !!getAssetIdFromUrl(anchor.href);
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

  function getRustDeskLinkFromAssetDocument(assetDoc) {
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

    return '';
  }

  async function fetchRustDeskLinkFromAsset(assetUrl) {
    const normalizedAssetUrl = normalizeUrl(assetUrl);
    if (!normalizedAssetUrl) return '';

    if (rustDeskLinkCache.has(normalizedAssetUrl)) {
      return await rustDeskLinkCache.get(normalizedAssetUrl);
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

        return getRustDeskLinkFromAssetDocument(assetDoc);
      })
      .catch((error) => {
        console.warn('[RustDesk Chat Button] Could not fetch asset page:', normalizedAssetUrl, error);
        return '';
      });

    rustDeskLinkCache.set(normalizedAssetUrl, promise);

    return await promise;
  }

  function findAssetPanel(assetLink, assetId) {
    let node = assetLink.parentElement;

    while (node && node !== document.body) {
      const hasThisAssetLink = !!node.querySelector(`a[href="/customer_assets/${assetId}"], a[href$="/customer_assets/${assetId}"]`);
      const hasRemoteButton = !!node.querySelector(
        `a[href*="/customer_assets/${assetId}/remote_access"], a[href*="/remote_access"], button, .dropdown-toggle`
      );

      if (hasThisAssetLink && hasRemoteButton) {
        return node;
      }

      node = node.parentElement;
    }

    return assetLink.closest('div, section, aside') || assetLink.parentElement;
  }

  function findRemoteAccessArea(assetPanel, assetId) {
    const remoteButton =
      assetPanel.querySelector(`a[href*="/customer_assets/${assetId}/remote_access"]`) ||
      assetPanel.querySelector('a[href*="/remote_access"]') ||
      Array.from(assetPanel.querySelectorAll('a, button')).find((element) => {
        const text = element.textContent || '';
        const title = element.getAttribute('title') || element.getAttribute('data-original-title') || '';
        const aria = element.getAttribute('aria-label') || '';

        return /remote access/i.test(`${text} ${title} ${aria}`);
      });

    if (!remoteButton) return null;

    return (
      remoteButton.closest('.btn-group')?.parentElement ||
      remoteButton.closest('.btn-group') ||
      remoteButton.parentElement
    );
  }

  function getOrCreateDropdownMenu(remoteArea) {
    let menu = remoteArea.querySelector('ul.dropdown-menu');
    if (menu) return menu;

    const dropdownToggle =
      remoteArea.querySelector('.dropdown-toggle') ||
      Array.from(remoteArea.querySelectorAll('a, button')).find((element) => {
        const text = element.textContent || '';
        const aria = element.getAttribute('aria-label') || '';
        return /caret|dropdown|more/i.test(`${text} ${aria}`) || element.querySelector('.caret');
      });

    if (dropdownToggle) {
      const toggleGroup = dropdownToggle.closest('.btn-group') || dropdownToggle.parentElement;

      menu = document.createElement('ul');
      menu.className = 'dropdown-menu dropdown-menu-right';

      toggleGroup.appendChild(menu);
      return menu;
    }

    const remoteButton =
      remoteArea.querySelector('a[href*="/remote_access"]') ||
      remoteArea.querySelector('a, button');

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

  function removeExistingRustDeskItem(remoteArea) {
    remoteArea
      ?.querySelectorAll(`li[${RUSTDESK_ITEM_ATTR}]`)
      .forEach((item) => item.remove());
  }

  function insertRustDeskMenuItem(menu, assetId, rustDeskUrl) {
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

  async function processAssetLink(assetLink) {
    const assetId = getAssetIdFromUrl(assetLink.href);
    if (!assetId) return;

    const assetPanel = findAssetPanel(assetLink, assetId);
    if (!assetPanel) return;

    const remoteArea = findRemoteAccessArea(assetPanel, assetId);
    if (!remoteArea) return;

    removeExistingRustDeskItem(remoteArea);

    const rustDeskUrl = await fetchRustDeskLinkFromAsset(assetLink.href);
    if (!rustDeskUrl) return;

    const menu = getOrCreateDropdownMenu(remoteArea);
    if (!menu) return;

    if (menu.querySelector(`li[${RUSTDESK_ITEM_ATTR}][data-asset-id="${assetId}"]`)) {
      return;
    }

    insertRustDeskMenuItem(menu, assetId, rustDeskUrl);
  }

  function getVisibleAssetLinks() {
    const links = Array.from(document.querySelectorAll('a[href*="/customer_assets/"]'))
      .filter(isAssetViewLink);

    const unique = new Map();

    links.forEach((link) => {
      const assetId = getAssetIdFromUrl(link.href);
      if (!assetId) return;
      unique.set(assetId, link);
    });

    return Array.from(unique.values());
  }

  async function processChatAssetPanels() {
    if (document.body?.dataset?.currentPage !== 'chats-show') return;

    const assetLinks = getVisibleAssetLinks();

    for (const assetLink of assetLinks) {
      await processAssetLink(assetLink);
    }
  }

  let pending = false;

  function scheduleProcessChatAssetPanels() {
    if (pending) return;

    pending = true;

    window.setTimeout(() => {
      pending = false;
      processChatAssetPanels();
    }, 600);
  }

  scheduleProcessChatAssetPanels();
  window.addEventListener('load', scheduleProcessChatAssetPanels);

  const observer = new MutationObserver(scheduleProcessChatAssetPanels);
  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
})();
