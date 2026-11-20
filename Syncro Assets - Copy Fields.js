// ==UserScript==
// @name         Syncro - Copy Asset Fields
// @namespace    https://texomans.com/
// @version      1.0.1
// @description  Copies Administrator Password or Tech Gurus Password from the current Syncro asset.
// @match        https://*.syncromsp.com/customer_assets/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Copy%20Fields.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Assets%20-%20Copy%20Fields.js
// @run-at       document-idle
// @noframes
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  const assetPath = /^\/customer_assets\/(\d+)\/?$/;
  const fields = ['Administrator Password', 'Tech Gurus Password'];
  const group = document.createElement('div');
  group.className = 'btn-group';
  group.id = 'tns-asset-copy-passwords';
  group.style.marginRight = '8px';
  group.innerHTML = `
    <button type="button" class="btn btn-default btn-sm dropdown-toggle"
            data-toggle="dropdown" aria-expanded="false">
      Copy <span class="caret" aria-hidden="true"></span>
    </button>
    <ul class="dropdown-menu"></ul>
    <span class="sr-only" role="status"></span>
    <span class="label label-default" aria-hidden="true" hidden
          style="position:absolute; top:calc(100% + 5px); right:0; z-index:1000; pointer-events:none;"></span>
  `;

  const menu = group.querySelector('ul');
  const announcement = group.querySelector('[role="status"]');
  const notice = group.querySelector('[aria-hidden][hidden]');
  let noticeTimer;
  let latestCopyRequest = 0;

  for (const field of fields) {
    const item = document.createElement('li');
    const link = document.createElement('a');
    link.href = '#';
    link.textContent = field;
    link.addEventListener('click', event => {
      event.preventDefault();
      void copyField(field);
    });
    item.appendChild(link);
    menu.appendChild(item);
  }

  function isVisible(element) {
    return element.getClientRects().length > 0 &&
      getComputedStyle(element).visibility === 'visible';
  }

  function findFieldCell(field, assetDocument, isAvailable) {
    const cells = assetDocument.querySelectorAll(`td[data-testid="${field}"]`);
    for (const cell of cells) {
      if (isAvailable(cell)) return cell;
    }

    for (const heading of assetDocument.querySelectorAll('th')) {
      const label = heading.textContent.trim().replace(/:$/, '').trim();
      const cell = heading.nextElementSibling;
      if (label === field && cell?.matches('td') && isAvailable(cell)) return cell;
    }
    return null;
  }

  async function findOverviewFieldCell(field, assetId) {
    // The base asset URL opens Overview without the selected tab's query or hash.
    const overviewUrl = new URL(`/customer_assets/${assetId}`, location.origin);
    const response = await fetch(overviewUrl, { mode: 'same-origin', cache: 'no-store' });
    const responseUrl = new URL(response.url);
    if (!response.ok || responseUrl.origin !== overviewUrl.origin ||
        responseUrl.pathname.match(assetPath)?.[1] !== assetId) {
      throw new Error('Could not load asset Overview');
    }

    const overview = new DOMParser().parseFromString(await response.text(), 'text/html');
    // Detached HTML has no layout, so check the markup instead of getClientRects().
    return findFieldCell(field, overview, cell => !cell.closest(
      '[hidden], .hidden, .sr-only, [aria-hidden="true"]'
    ));
  }

  function getFieldValue(cell) {
    const content = cell.cloneNode(true);
    for (const control of content.querySelectorAll(
      'button, [role="button"], .sr-only, .hidden, [aria-hidden="true"], [hidden]'
    )) {
      control.remove();
    }

    const displayed = content.textContent.trim();
    const preview = displayed.replace(/(?:\.{3}|…)$/, '');
    if (!displayed || /^(?:[-–—]|[*•●]{3,}(?:\.{3}|…)?)$/u.test(displayed)) return '';
    if (preview === displayed) return displayed;

    // Syncro may put the full text of a truncated field in its tooltip.
    for (const element of [content, ...content.querySelectorAll('[data-original-title], [title]')]) {
      const fullValue = element.getAttribute('data-original-title') || element.getAttribute('title');
      if (preview && fullValue?.startsWith(preview) && fullValue.length > preview.length) return fullValue;
    }
    return displayed;
  }

  function showStatus(message) {
    clearTimeout(noticeTimer);
    announcement.textContent = message;
    notice.textContent = message;
    notice.hidden = false;
    noticeTimer = setTimeout(() => {
      notice.hidden = true;
      announcement.textContent = '';
    }, 2400);
  }

  async function copyField(field) {
    const assetId = location.pathname.match(assetPath)?.[1];
    if (!assetId) return;

    const request = ++latestCopyRequest;
    const isCurrent = () => request === latestCopyRequest &&
      location.pathname.match(assetPath)?.[1] === assetId;

    try {
      let cell = findFieldCell(field, document, isVisible);
      if (!cell) {
        showStatus('Loading asset fields…');
        cell = await findOverviewFieldCell(field, assetId);
      }
      if (!isCurrent()) return;

      const value = cell ? getFieldValue(cell) : '';
      if (!value) {
        showStatus('Nothing found to copy');
        return;
      }

      if (typeof GM_setClipboard === 'function') {
        GM_setClipboard(value, 'text');
      } else {
        await navigator.clipboard.writeText(value);
      }
      if (isCurrent()) showStatus(`Copied ${field}`);
    } catch {
      if (isCurrent()) showStatus('Copy failed');
    }
  }

  function mount() {
    const remote = assetPath.test(location.pathname) &&
      document.querySelector('.btn-bar .btn-remote-access');
    if (!remote) {
      group.remove();
      return;
    }

    const bar = remote.closest('.btn-bar');
    let remoteGroup = remote;
    while (remoteGroup.parentElement !== bar) {
      remoteGroup = remoteGroup.parentElement;
    }
    if (group.nextElementSibling !== remoteGroup) remoteGroup.before(group);
  }

  let scheduled = false;
  new MutationObserver(() => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      mount();
    });
  }).observe(document.body, { childList: true, subtree: true });
  mount();
})();
