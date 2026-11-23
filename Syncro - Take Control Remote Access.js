// ==UserScript==
// @name         Syncro - Take Control Remote Access
// @namespace    https://texomans.com/
// @version      1.0.0
// @description  Take Control controls for asset details, Assets & RMM, tickets, chat, Customers asset tables, and RMM Alerts.
// @match        https://*.syncromsp.com/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20Take%20Control%20Remote%20Access.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20Take%20Control%20Remote%20Access.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

// Original handler: Syncro Asset - Add TakeControl Remote Access Button.js
(function () {
  'use strict';

  const TAKECONTROL_ITEM_ATTR =
    'data-tns-takecontrol-menu-item';

  const TAKECONTROL_DROPDOWN_ATTR =
    'data-tns-takecontrol-remote-dropdown';

  const TAKECONTROL_DIRECT_ATTR =
    'data-tns-takecontrol-direct-button';

  const TAKECONTROL_DIRECT_GROUP_ATTR =
    'data-tns-takecontrol-direct-group';


  function normalizeUrl(value) {
    // Keep Base64 case and padding intact. Only accept a single endpoint command.
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    const match = trimmed.match(/^mspasp:\/\/([A-Za-z0-9+/]+={0,2})$/i);
    if (!match || match[1].length > 2048 || match[1].length % 4 !== 0) return '';
    try {
      const command = atob(match[1]);
      if (btoa(command) !== match[1] || !/^-s [A-Za-z0-9_-]+$/.test(command)) return '';
      return 'mspasp://' + match[1];
    } catch {
      return '';
    }
  }

  function isMobileLikeDevice() {
    if (
      navigator.userAgentData?.mobile ===
      true
    ) {
      return true;
    }

    if (
      /Android|iPhone|iPad|iPod|Mobile/i.test(
        navigator.userAgent
      )
    ) {
      return true;
    }

    return (
      navigator.maxTouchPoints > 0 &&
      window.matchMedia(
        '(pointer: coarse)'
      ).matches
    );
  }

  function shouldUseNativeNavigation(event) {
    return (
      isMobileLikeDevice() ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  function openTakeControlLaunchPage(takeControlUrl) {
    const link = normalizeUrl(takeControlUrl);
    if (!link) return;
    // Launch synchronously from the click so the browser can open its handler.
    // The installed console handles technician sign-in and endpoint authorization.
    window.location.assign(link);
  }

  function getTakeControlLinkFromCustomField() {
    const fieldCell =
      document.querySelector(
        'td[data-testid="Take Control Link"]'
      );

    if (!fieldCell) {
      return '';
    }

    for (const anchor of fieldCell.querySelectorAll('a[href]')) {
        const fieldUrl = normalizeUrl(anchor.getAttribute('href'));
        if (fieldUrl) return fieldUrl;
      }

    return normalizeUrl(
      fieldCell.textContent
    );
  }

  function getTakeControlLinkFromReactProps() {
    const propNodes =
      document.querySelectorAll(
        '[data-react-props]'
      );

    for (const node of propNodes) {
      const raw =
        node.getAttribute(
          'data-react-props'
        );

      if (
        !raw ||
        !raw.includes(
          'Take Control Link'
        )
      ) {
        continue;
      }

      try {
        const props =
          JSON.parse(raw);

        const candidates = [
          props?.asset?.properties?.[
            'Take Control Link'
          ],
          props?.asset?.new_properties?.[
            'Take Control Link'
          ],
          props?.properties?.[
            'Take Control Link'
          ],
          props?.new_properties?.[
            'Take Control Link'
          ]
        ];

        for (
          const candidate of
          candidates
        ) {
          const normalized =
            normalizeUrl(
              candidate
            );

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

  function getTakeControlLinkFromAssetDocument(assetDoc, rawHtml = '', expectedAssetId = '') {
    const expected = String(expectedAssetId);
    if (!/^\d+$/.test(expected)) return '';
    const rowScoped = assetDoc.nodeType === 1 && assetDoc.matches('tr, [role="row"]');
    const propNodes = [
      ...(assetDoc.nodeType === 1 && assetDoc.matches('[data-react-props], [data-props]') ? [assetDoc] : []),
      ...assetDoc.querySelectorAll('[data-react-props], [data-props]')
    ];
    let identifiedRecords = false;
    let rowValue = '';

    function findAssetRecord(object) {
      if (!object || typeof object !== 'object') return null;
      // Traverse records by identity; never search recursively for the field name.
      const hasFields = Object.prototype.hasOwnProperty.call(object, 'properties') ||
        Object.prototype.hasOwnProperty.call(object, 'new_properties');
      const id = object.id ?? object.asset_id ?? object.assetId;
      if (hasFields && id != null) {
        identifiedRecords = true;
        if (String(id) === expected) return object;
      }
      for (const child of Object.values(object)) {
        const record = findAssetRecord(child);
        if (record) return record;
      }
      return null;
    }

    function readOwnField(record) {
      for (const fields of [record.properties, record.new_properties]) {
        if (fields && Object.prototype.hasOwnProperty.call(fields, 'Take Control Link')) {
          return normalizeUrl(fields['Take Control Link']);
        }
      }
      return '';
    }

    for (const node of propNodes) {
      try {
        const props = JSON.parse(node.getAttribute('data-react-props') || node.getAttribute('data-props') || '{}');
        const record = findAssetRecord(props);
        // A matched asset with a missing/empty field is authoritative.
        if (record) return readOwnField(record);
        if (rowScoped) {
          for (const candidate of [props.asset, props]) {
            if (candidate && candidate.id == null && candidate.asset_id == null && candidate.assetId == null) {
              rowValue ||= readOwnField(candidate);
            }
          }
        }
      } catch { /* Invalid component data is not a source of remote links. */ }
    }
    if (identifiedRecords) return '';
    if (rowScoped && rowValue) return rowValue;

    // With no embedded asset records, the explicit field on the requested asset
    // page (or the already-identified row) is the only remaining permitted source.
    const fieldCell = assetDoc.querySelector('td[data-testid="Take Control Link"]');
    if (!fieldCell) return '';
    for (const anchor of fieldCell.querySelectorAll('a[href]')) {
      const value = normalizeUrl(anchor.getAttribute('href'));
      if (value) return value;
    }
    return normalizeUrl(fieldCell.textContent);
  }

  function getTakeControlLink() {
    const assetId = location.pathname.match(/^\/customer_assets\/(\d+)\/?$/)?.[1] || '';
    return getTakeControlLinkFromAssetDocument(document, '', assetId);
  }

  function getNativeRemoteAccessButton() {
    return document.querySelector(
      '.btn-remote-access'
    );
  }

  function getBackgroundingToolsButton() {
    const buttons =
      document.querySelectorAll(
        '.btn-bar a.btn'
      );

    return (
      Array.from(buttons).find(
        (button) =>
          /backgrounding\s+tools/i.test(
            button.textContent || ''
          )
      ) ||
      null
    );
  }

  function getButtonBar() {
    const remoteButton =
      getNativeRemoteAccessButton();

    if (remoteButton) {
      const bar =
        remoteButton.closest(
          '.btn-bar'
        );

      if (bar) {
        return bar;
      }
    }

    const backgroundButton =
      getBackgroundingToolsButton();

    if (backgroundButton) {
      const bar =
        backgroundButton.closest(
          '.btn-bar'
        );

      if (bar) {
        return bar;
      }
    }

    return document.querySelector(
      '.btn-bar'
    );
  }

  function getNativeRemoteAccessMenu(
    remoteButton
  ) {
    const next =
      remoteButton.nextElementSibling;

    if (!next) {
      return null;
    }

    if (
      !next.matches('.btn-group')
    ) {
      return null;
    }

    if (
      next.hasAttribute(
        TAKECONTROL_DROPDOWN_ATTR
      )
    ) {
      return null;
    }

    const toggle =
      next.querySelector(
        ':scope > .dropdown-toggle'
      );

    const menu =
      next.querySelector(
        ':scope > ul.dropdown-menu'
      );

    if (
      !toggle ||
      !menu
    ) {
      return null;
    }

    return menu;
  }

  function findScreenConnectItem(menu) {
    return (
      Array.from(
        menu.querySelectorAll(
          ':scope > li'
        )
      ).find((li) =>
        /screen\s*connect/i.test(
          li.textContent || ''
        )
      ) ||
      null
    );
  }

  function removeTakeControlMenuItemsExcept(
    keepItem = null
  ) {
    document
      .querySelectorAll(
        `li[${TAKECONTROL_ITEM_ATTR}]`
      )
      .forEach((item) => {
        if (
          item !== keepItem
        ) {
          item.remove();
        }
      });
  }

  function removeCustomRemoteDropdown() {
    document
      .querySelectorAll(
        `[${TAKECONTROL_DROPDOWN_ATTR}]`
      )
      .forEach(
        (element) =>
          element.remove()
      );
  }

  function removeDirectTakeControlButton() {
    document
      .querySelectorAll(
        `[${TAKECONTROL_DIRECT_ATTR}]`
      )
      .forEach(
        (element) =>
          element.remove()
      );

    document
      .querySelectorAll(
        `[${TAKECONTROL_DIRECT_GROUP_ATTR}]`
      )
      .forEach((group) => {
        if (
          !group.children.length
        ) {
          group.remove();
        }
      });
  }

  function removeAllTakeControlControls() {
    removeTakeControlMenuItemsExcept();
    removeCustomRemoteDropdown();
    removeDirectTakeControlButton();

    document
      .querySelectorAll(
        `[${TAKECONTROL_DIRECT_GROUP_ATTR}]`
      )
      .forEach(
        (element) =>
          element.remove()
      );
  }

  function getOrCreateTakeControlDropdown(
    remoteButton
  ) {
    let dropdownGroup =
      document.querySelector(
        `[${TAKECONTROL_DROPDOWN_ATTR}]`
      );

    if (!dropdownGroup) {
      dropdownGroup =
        document.createElement(
          'div'
        );

      dropdownGroup.className =
        'btn-group';

      dropdownGroup.setAttribute(
        TAKECONTROL_DROPDOWN_ATTR,
        'true'
      );

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

    if (
      remoteButton.nextElementSibling !==
      dropdownGroup
    ) {
      remoteButton.insertAdjacentElement(
        'afterend',
        dropdownGroup
      );
    }

    return dropdownGroup.querySelector(
      ':scope > ul.dropdown-menu'
    );
  }

  function getOrCreateTakeControlMenuItem(
    menu,
    takeControlUrl
  ) {
    let item =
      menu.querySelector(
        `:scope > li[${TAKECONTROL_ITEM_ATTR}]`
      );

    if (!item) {
      item =
        document.createElement(
          'li'
        );

      item.setAttribute(
        TAKECONTROL_ITEM_ATTR,
        'true'
      );

      const link =
        document.createElement(
          'a'
        );

      link.textContent =
        'Take Control';

      link.addEventListener(
        'click',
        (event) => {
          if (
            shouldUseNativeNavigation(
              event
            )
          ) {
            return;
          }

          event.preventDefault();

          if (link.href) {
            openTakeControlLaunchPage(
              link.href
            );
          }
        }
      );

      item.appendChild(
        link
      );
    }

    const link =
      item.querySelector('a');

    if (link) {
      link.href =
        takeControlUrl;

      link.target =
        '_self';

      link.rel =
        'noopener noreferrer';
    }

    const screenConnectItem =
      findScreenConnectItem(
        menu
      );

    if (screenConnectItem) {
      if (
        screenConnectItem.previousElementSibling !==
        item
      ) {
        menu.insertBefore(
          item,
          screenConnectItem
        );
      }
    } else if (
      menu.firstElementChild !==
      item
    ) {
      menu.insertBefore(
        item,
        menu.firstElementChild
      );
    }

    return item;
  }

  function configureRemoteAccessDropdown(
    remoteButton,
    takeControlUrl
  ) {
    removeDirectTakeControlButton();

    let menu =
      getNativeRemoteAccessMenu(
        remoteButton
      );

    if (menu) {
      removeCustomRemoteDropdown();
    } else {
      menu =
        getOrCreateTakeControlDropdown(
          remoteButton
        );
    }

    if (!menu) {
      return;
    }

    const takeControlItem =
      getOrCreateTakeControlMenuItem(
        menu,
        takeControlUrl
      );

    removeTakeControlMenuItemsExcept(
      takeControlItem
    );
  }

  function configureDirectTakeControlButton(
    takeControlUrl
  ) {
    removeCustomRemoteDropdown();
    removeTakeControlMenuItemsExcept();

    const backgroundButton =
      getBackgroundingToolsButton();

    const buttonBar =
      getButtonBar();

    if (
      !backgroundButton &&
      !buttonBar
    ) {
      return;
    }

    let takeControlButton =
      document.querySelector(
        `[${TAKECONTROL_DIRECT_ATTR}]`
      );

    if (!takeControlButton) {
      takeControlButton =
        document.createElement(
          'a'
        );

      takeControlButton.className =
        'btn btn-default btn-sm';

      takeControlButton.setAttribute(
        TAKECONTROL_DIRECT_ATTR,
        'true'
      );

      takeControlButton.innerHTML =
        '<i class="fas fa-desktop"></i>&nbsp;Take Control';

      takeControlButton.addEventListener(
        'click',
        (event) => {
          if (
            shouldUseNativeNavigation(
              event
            )
          ) {
            return;
          }

          event.preventDefault();

          if (
            takeControlButton.href
          ) {
            openTakeControlLaunchPage(
              takeControlButton.href
            );
          }
        }
      );
    }

    takeControlButton.href =
      takeControlUrl;

    takeControlButton.target =
      '_self';

    takeControlButton.rel =
      'noopener noreferrer';

    if (
      backgroundButton?.parentElement
    ) {
      if (
        takeControlButton.parentElement !==
          backgroundButton.parentElement ||
        takeControlButton.nextElementSibling !==
          backgroundButton
      ) {
        backgroundButton.parentElement.insertBefore(
          takeControlButton,
          backgroundButton
        );
      }

      document
        .querySelectorAll(
          `[${TAKECONTROL_DIRECT_GROUP_ATTR}]`
        )
        .forEach((group) => {
          if (
            !group.children.length
          ) {
            group.remove();
          }
        });

      return;
    }

    let group =
      document.querySelector(
        `[${TAKECONTROL_DIRECT_GROUP_ATTR}]`
      );

    if (!group) {
      group =
        document.createElement(
          'div'
        );

      group.className =
        'btn-group';

      group.setAttribute(
        TAKECONTROL_DIRECT_GROUP_ATTR,
        'true'
      );

      buttonBar.prepend(
        group
      );
    }

    if (
      takeControlButton.parentElement !==
      group
    ) {
      group.appendChild(
        takeControlButton
      );
    }
  }

  function updateTakeControlControls() {
    if (!/^\/customer_assets\/\d+\/?$/.test(location.pathname)) return;
    const takeControlUrl =
      getTakeControlLink();

    if (!takeControlUrl) {
      removeAllTakeControlControls();

      return;
    }

    const remoteButton =
      getNativeRemoteAccessButton();

    if (remoteButton) {
      configureRemoteAccessDropdown(
        remoteButton,
        takeControlUrl
      );
    } else {
      configureDirectTakeControlButton(
        takeControlUrl
      );
    }
  }

  let pending = false;

  function scheduleUpdate() {
    if (pending) {
      return;
    }

    pending = true;

    window.setTimeout(() => {
      pending = false;

      updateTakeControlControls();
    }, 250);
  }

  scheduleUpdate();

  window.addEventListener(
    'load',
    scheduleUpdate
  );

  const observer =
    new MutationObserver(
      scheduleUpdate
    );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );
})();

// Original handler: Syncro Assets List - Add TakeControl to Remote Access Dropdown.js
(function () {
  'use strict';

  const TAKECONTROL_ITEM_ATTR =
    'data-tns-takecontrol-assets-index-menu-item';


  function isAssetsIndexPage() {
    return (
      document.body?.dataset?.currentPage ===
        'assets-index' ||
      !!document.querySelector(
        'table[data-testid="assets-table"]'
      )
    );
  }

  function normalizeUrl(value) {
    // Keep Base64 case and padding intact. Only accept a single endpoint command.
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    const match = trimmed.match(/^mspasp:\/\/([A-Za-z0-9+/]+={0,2})$/i);
    if (!match || match[1].length > 2048 || match[1].length % 4 !== 0) return '';
    try {
      const command = atob(match[1]);
      if (btoa(command) !== match[1] || !/^-s [A-Za-z0-9_-]+$/.test(command)) return '';
      return 'mspasp://' + match[1];
    } catch {
      return '';
    }
  }

  function isMobileLikeDevice() {
    if (
      navigator.userAgentData?.mobile ===
      true
    ) {
      return true;
    }

    if (
      /Android|iPhone|iPad|iPod|Mobile/i.test(
        navigator.userAgent
      )
    ) {
      return true;
    }

    return (
      navigator.maxTouchPoints > 0 &&
      window.matchMedia(
        '(pointer: coarse)'
      ).matches
    );
  }

  function shouldUseNativeNavigation(event) {
    return (
      isMobileLikeDevice() ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  function openTakeControlLaunchPage(takeControlUrl) {
    const link = normalizeUrl(takeControlUrl);
    if (!link) return;
    // Launch synchronously from the click so the browser can open its handler.
    // The installed console handles technician sign-in and endpoint authorization.
    window.location.assign(link);
  }

  function findValueByKey(
    object,
    targetKey
  ) {
    if (
      !object ||
      typeof object !== 'object'
    ) {
      return '';
    }

    if (
      Object.prototype.hasOwnProperty.call(
        object,
        targetKey
      )
    ) {
      return (
        object[targetKey] ||
        ''
      );
    }

    for (
      const value of
      Object.values(object)
    ) {
      const found =
        findValueByKey(
          value,
          targetKey
        );

      if (found) {
        return found;
      }
    }

    return '';
  }

  function getAssetIdFromRow(row) {
    const rowTestId =
      row.getAttribute(
        'data-testid'
      ) ||
      '';

    const rowMatch =
      rowTestId.match(
        /^asset-row-(\d+)$/
      );

    if (rowMatch) {
      return rowMatch[1];
    }

    const checkbox =
      row.querySelector(
        'input.selectedId[value]'
      );

    if (checkbox?.value) {
      return checkbox.value;
    }

    const assetLink =
      row.querySelector(
        'a[href^="/customer_assets/"], a[href*="/customer_assets/"]'
      );

    if (assetLink?.href) {
      const parsed =
        new URL(
          assetLink.href,
          window.location.origin
        );

      const linkMatch =
        parsed.pathname.match(
          /^\/customer_assets\/(\d+)\/?$/
        );

      if (linkMatch) {
        return linkMatch[1];
      }
    }

    return '';
  }

  function getTakeControlLinkFromAssetDocument(assetDoc, rawHtml = '', expectedAssetId = '') {
    const expected = String(expectedAssetId);
    if (!/^\d+$/.test(expected)) return '';
    const rowScoped = assetDoc.nodeType === 1 && assetDoc.matches('tr, [role="row"]');
    const propNodes = [
      ...(assetDoc.nodeType === 1 && assetDoc.matches('[data-react-props], [data-props]') ? [assetDoc] : []),
      ...assetDoc.querySelectorAll('[data-react-props], [data-props]')
    ];
    let identifiedRecords = false;
    let rowValue = '';

    function findAssetRecord(object) {
      if (!object || typeof object !== 'object') return null;
      // Traverse records by identity; never search recursively for the field name.
      const hasFields = Object.prototype.hasOwnProperty.call(object, 'properties') ||
        Object.prototype.hasOwnProperty.call(object, 'new_properties');
      const id = object.id ?? object.asset_id ?? object.assetId;
      if (hasFields && id != null) {
        identifiedRecords = true;
        if (String(id) === expected) return object;
      }
      for (const child of Object.values(object)) {
        const record = findAssetRecord(child);
        if (record) return record;
      }
      return null;
    }

    function readOwnField(record) {
      for (const fields of [record.properties, record.new_properties]) {
        if (fields && Object.prototype.hasOwnProperty.call(fields, 'Take Control Link')) {
          return normalizeUrl(fields['Take Control Link']);
        }
      }
      return '';
    }

    for (const node of propNodes) {
      try {
        const props = JSON.parse(node.getAttribute('data-react-props') || node.getAttribute('data-props') || '{}');
        const record = findAssetRecord(props);
        // A matched asset with a missing/empty field is authoritative.
        if (record) return readOwnField(record);
        if (rowScoped) {
          for (const candidate of [props.asset, props]) {
            if (candidate && candidate.id == null && candidate.asset_id == null && candidate.assetId == null) {
              rowValue ||= readOwnField(candidate);
            }
          }
        }
      } catch { /* Invalid component data is not a source of remote links. */ }
    }
    if (identifiedRecords) return '';
    if (rowScoped && rowValue) return rowValue;

    // With no embedded asset records, the explicit field on the requested asset
    // page (or the already-identified row) is the only remaining permitted source.
    const fieldCell = assetDoc.querySelector('td[data-testid="Take Control Link"]');
    if (!fieldCell) return '';
    for (const anchor of fieldCell.querySelectorAll('a[href]')) {
      const value = normalizeUrl(anchor.getAttribute('href'));
      if (value) return value;
    }
    return normalizeUrl(fieldCell.textContent);
  }

  function getTakeControlLinkFromRow(row) {
    return getTakeControlLinkFromAssetDocument(row, '', getAssetIdFromRow(row));
  }

  function getRemoteAccessWrapper(
    row,
    assetId
  ) {
    const remoteButton =
      row.querySelector(
        `a.btn-remote-access[href*="/customer_assets/${assetId}/remote_access"]`
      ) ||
      row.querySelector(
        `a[href*="/customer_assets/${assetId}/remote_access"]`
      ) ||
      row.querySelector(
        'a.btn-remote-access'
      );

    if (!remoteButton) {
      return null;
    }

    return (
      remoteButton.closest(
        '.btn-group[style*="min-width"]'
      ) ||
      remoteButton.closest(
        '.btn-group'
      ) ||
      remoteButton.parentElement
    );
  }

  function getOrCreateRemoteAccessMenu(
    wrapper
  ) {
    let menu =
      wrapper.querySelector(
        'ul.dropdown-menu'
      );

    if (menu) {
      return menu;
    }

    const remoteButton =
      wrapper.querySelector(
        'a.btn-remote-access'
      ) ||
      wrapper.querySelector(
        'a[href*="/remote_access"]'
      ) ||
      wrapper.querySelector(
        'a.btn'
      );

    if (!remoteButton) {
      return null;
    }

    const dropdownGroup =
      document.createElement(
        'div'
      );

    dropdownGroup.className =
      'btn-group';

    dropdownGroup.setAttribute('data-tns-takecontrol-assets-index-dropdown', 'true');

    dropdownGroup.innerHTML = `
      <a class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown" href="#">
        &nbsp;<span class="caret"></span>
      </a>
      <ul class="dropdown-menu dropdown-menu-right"></ul>
    `;

    remoteButton.insertAdjacentElement(
      'afterend',
      dropdownGroup
    );

    return dropdownGroup.querySelector(
      'ul.dropdown-menu'
    );
  }

  function findScreenConnectItem(menu) {
    return Array.from(
      menu.querySelectorAll(
        'li'
      )
    ).find((li) =>
      /screenconnect/i.test(
        li.textContent || ''
      )
    );
  }

  function removeExistingTakeControlItem(
    wrapper
  ) {
    wrapper
      ?.querySelectorAll(
        `li[${TAKECONTROL_ITEM_ATTR}]`
      )
      .forEach(
        (item) =>
          item.remove()
      );
  }

  function addTakeControlToRow(row) {
    const assetId =
      getAssetIdFromRow(
        row
      );

    if (!assetId) {
      return;
    }

    const wrapper =
      getRemoteAccessWrapper(
        row,
        assetId
      );

    if (!wrapper) {
      return;
    }

    removeExistingTakeControlItem(
      wrapper
    );

    const takeControlUrl =
      getTakeControlLinkFromRow(
        row
      );

    if (!takeControlUrl) {
      wrapper.querySelectorAll('[data-tns-takecontrol-assets-index-dropdown]').forEach(group => group.remove());
      return;
    }

    const menu =
      getOrCreateRemoteAccessMenu(
        wrapper
      );

    if (!menu) {
      return;
    }

    const takeControlItem =
      document.createElement(
        'li'
      );

    takeControlItem.setAttribute(
      TAKECONTROL_ITEM_ATTR,
      'true'
    );

    takeControlItem.setAttribute(
      'data-asset-id',
      assetId
    );

    const takeControlAnchor =
      document.createElement(
        'a'
      );

    takeControlAnchor.href =
      takeControlUrl;

    takeControlAnchor.target =
      '_self';

    takeControlAnchor.rel =
      'noopener noreferrer';

    takeControlAnchor.textContent =
      'Take Control';

    takeControlAnchor.addEventListener(
      'click',
      (event) => {
        if (
          shouldUseNativeNavigation(
            event
          )
        ) {
          return;
        }

        event.preventDefault();

        openTakeControlLaunchPage(
          takeControlAnchor.href
        );
      }
    );

    takeControlItem.appendChild(
      takeControlAnchor
    );

    const screenConnectItem =
      findScreenConnectItem(
        menu
      );

    if (screenConnectItem) {
      menu.insertBefore(
        takeControlItem,
        screenConnectItem
      );
    } else {
      menu.insertBefore(
        takeControlItem,
        menu.firstElementChild
      );
    }
  }

  function processAssetRows() {
    if (!location.pathname.startsWith("/customer_assets")) return;
    if (!isAssetsIndexPage()) {
      return;
    }

    const rows =
      document.querySelectorAll(
        'tr[data-testid^="asset-row-"], table[data-testid="assets-table"] tbody tr'
      );

    rows.forEach(
      addTakeControlToRow
    );
  }

  let pending = false;

  function scheduleProcessAssetRows() {
    if (pending) {
      return;
    }

    pending = true;

    window.setTimeout(() => {
      pending = false;

      processAssetRows();
    }, 300);
  }

  scheduleProcessAssetRows();

  window.addEventListener(
    'load',
    scheduleProcessAssetRows
  );

  const observer =
    new MutationObserver(
      scheduleProcessAssetRows
    );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );
})();

// Original handler: Syncro Chat - Add TakeControl to Asset Remote Dropdown.js
(function () {
  'use strict';

  const TAKECONTROL_ITEM_ATTR = 'data-tns-takecontrol-chat-menu-item';
  const TAKECONTROL_LAUNCH_TAB_CLOSE_DELAY = 3000;

  const takeControlLinkCache = new Map();

  function normalizeUrl(value) {
    // Keep Base64 case and padding intact. Only accept a single endpoint command.
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    const match = trimmed.match(/^mspasp:\/\/([A-Za-z0-9+/]+={0,2})$/i);
    if (!match || match[1].length > 2048 || match[1].length % 4 !== 0) return '';
    try {
      const command = atob(match[1]);
      if (btoa(command) !== match[1] || !/^-s [A-Za-z0-9_-]+$/.test(command)) return '';
      return 'mspasp://' + match[1];
    } catch {
      return '';
    }
  }

  function isMobileLikeDevice() {
    if (navigator.userAgentData?.mobile === true) {
      return true;
    }

    if (/Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)) {
      return true;
    }

    return (
      navigator.maxTouchPoints > 0 &&
      window.matchMedia('(pointer: coarse)').matches
    );
  }

  function shouldUseNativeNavigation(event) {
    return (
      isMobileLikeDevice() ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  function openTakeControlLaunchPage(takeControlUrl) {
    const link = normalizeUrl(takeControlUrl);
    if (!link) return;
    // Launch synchronously from the click so the browser can open its handler.
    // The installed console handles technician sign-in and endpoint authorization.
    window.location.assign(link);
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

  function getTakeControlLinkFromAssetDocument(assetDoc, rawHtml = '', expectedAssetId = '') {
    const expected = String(expectedAssetId);
    if (!/^\d+$/.test(expected)) return '';
    const rowScoped = assetDoc.nodeType === 1 && assetDoc.matches('tr, [role="row"]');
    const propNodes = [
      ...(assetDoc.nodeType === 1 && assetDoc.matches('[data-react-props], [data-props]') ? [assetDoc] : []),
      ...assetDoc.querySelectorAll('[data-react-props], [data-props]')
    ];
    let identifiedRecords = false;
    let rowValue = '';

    function findAssetRecord(object) {
      if (!object || typeof object !== 'object') return null;
      // Traverse records by identity; never search recursively for the field name.
      const hasFields = Object.prototype.hasOwnProperty.call(object, 'properties') ||
        Object.prototype.hasOwnProperty.call(object, 'new_properties');
      const id = object.id ?? object.asset_id ?? object.assetId;
      if (hasFields && id != null) {
        identifiedRecords = true;
        if (String(id) === expected) return object;
      }
      for (const child of Object.values(object)) {
        const record = findAssetRecord(child);
        if (record) return record;
      }
      return null;
    }

    function readOwnField(record) {
      for (const fields of [record.properties, record.new_properties]) {
        if (fields && Object.prototype.hasOwnProperty.call(fields, 'Take Control Link')) {
          return normalizeUrl(fields['Take Control Link']);
        }
      }
      return '';
    }

    for (const node of propNodes) {
      try {
        const props = JSON.parse(node.getAttribute('data-react-props') || node.getAttribute('data-props') || '{}');
        const record = findAssetRecord(props);
        // A matched asset with a missing/empty field is authoritative.
        if (record) return readOwnField(record);
        if (rowScoped) {
          for (const candidate of [props.asset, props]) {
            if (candidate && candidate.id == null && candidate.asset_id == null && candidate.assetId == null) {
              rowValue ||= readOwnField(candidate);
            }
          }
        }
      } catch { /* Invalid component data is not a source of remote links. */ }
    }
    if (identifiedRecords) return '';
    if (rowScoped && rowValue) return rowValue;

    // With no embedded asset records, the explicit field on the requested asset
    // page (or the already-identified row) is the only remaining permitted source.
    const fieldCell = assetDoc.querySelector('td[data-testid="Take Control Link"]');
    if (!fieldCell) return '';
    for (const anchor of fieldCell.querySelectorAll('a[href]')) {
      const value = normalizeUrl(anchor.getAttribute('href'));
      if (value) return value;
    }
    return normalizeUrl(fieldCell.textContent);
  }

  async function fetchTakeControlLinkFromAsset(assetUrl) {
    const normalizedAssetUrl = new URL(assetUrl, window.location.origin).href;

    if (!normalizedAssetUrl) {
      return '';
    }

    if (takeControlLinkCache.has(normalizedAssetUrl)) {
      return await takeControlLinkCache.get(normalizedAssetUrl);
    }

    const promise = fetch(normalizedAssetUrl, {
      method: 'GET',
      credentials: 'same-origin'
    })
      .then(async (response) => {
        if (!response.ok) {
          throw new Error(`Asset page returned HTTP ${response.status}`);
        }

        if (response.url && getAssetIdFromUrl(response.url) !== getAssetIdFromUrl(normalizedAssetUrl)) return '';
        const html = await response.text();

        const assetDoc = new DOMParser().parseFromString(
          html,
          'text/html'
        );

        return getTakeControlLinkFromAssetDocument(assetDoc, html, getAssetIdFromUrl(normalizedAssetUrl));
      })
      .catch((error) => {
        console.warn(
          '[TakeControl Chat Button] Could not fetch asset page:',
          normalizedAssetUrl,
          error
        );

        return '';
      });

    takeControlLinkCache.set(normalizedAssetUrl, promise);

    return await promise;
  }

  function findAssetPanel(assetLink, assetId) {
    let node = assetLink.parentElement;

    while (node && node !== document.body) {
      const hasThisAssetLink = !!node.querySelector(
        `a[href="/customer_assets/${assetId}"], a[href$="/customer_assets/${assetId}"]`
      );

      const hasRemoteButton = !!node.querySelector(
        `a[href*="/customer_assets/${assetId}/remote_access"], a[href*="/remote_access"], button, .dropdown-toggle`
      );

      if (hasThisAssetLink && hasRemoteButton) {
        return node;
      }

      node = node.parentElement;
    }

    return (
      assetLink.closest('div, section, aside') ||
      assetLink.parentElement
    );
  }

  function findRemoteAccessArea(assetPanel, assetId) {
    const remoteButton =
      assetPanel.querySelector(
        `a[href*="/customer_assets/${assetId}/remote_access"]`
      ) ||
      assetPanel.querySelector('a[href*="/remote_access"]') ||
      Array.from(
        assetPanel.querySelectorAll('a, button')
      ).find((element) => {
        const text = element.textContent || '';

        const title =
          element.getAttribute('title') ||
          element.getAttribute('data-original-title') ||
          '';

        const aria =
          element.getAttribute('aria-label') ||
          '';

        return /remote access/i.test(
          `${text} ${title} ${aria}`
        );
      });

    if (!remoteButton) {
      return null;
    }

    return (
      remoteButton.closest('.btn-group')?.parentElement ||
      remoteButton.closest('.btn-group') ||
      remoteButton.parentElement
    );
  }

  function getOrCreateDropdownMenu(remoteArea) {
    let menu = remoteArea.querySelector(
      'ul.dropdown-menu'
    );

    if (menu) {
      return menu;
    }

    const dropdownToggle =
      remoteArea.querySelector('.dropdown-toggle') ||
      Array.from(
        remoteArea.querySelectorAll('a, button')
      ).find((element) => {
        const text =
          element.textContent ||
          '';

        const aria =
          element.getAttribute('aria-label') ||
          '';

        return (
          /caret|dropdown|more/i.test(
            `${text} ${aria}`
          ) ||
          element.querySelector('.caret')
        );
      });

    if (dropdownToggle) {
      const toggleGroup =
        dropdownToggle.closest('.btn-group') ||
        dropdownToggle.parentElement;

      menu = document.createElement('ul');
      menu.className =
        'dropdown-menu dropdown-menu-right';

      toggleGroup.appendChild(menu);

      return menu;
    }

    const remoteButton =
      remoteArea.querySelector(
        'a[href*="/remote_access"]'
      ) ||
      remoteArea.querySelector(
        'a, button'
      );

    if (!remoteButton) {
      return null;
    }

    const dropdownGroup =
      document.createElement('div');

    dropdownGroup.className =
      'btn-group';

    dropdownGroup.setAttribute('data-tns-takecontrol-chat-dropdown', 'true');

    dropdownGroup.innerHTML = `
      <a class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown" href="#">
        &nbsp;<span class="caret"></span>
      </a>
      <ul class="dropdown-menu dropdown-menu-right"></ul>
    `;

    remoteButton.insertAdjacentElement(
      'afterend',
      dropdownGroup
    );

    return dropdownGroup.querySelector(
      'ul.dropdown-menu'
    );
  }

  function findScreenConnectItem(menu) {
    return Array.from(
      menu.querySelectorAll('li')
    ).find((li) =>
      /screenconnect/i.test(
        li.textContent || ''
      )
    );
  }

  function removeExistingTakeControlItem(remoteArea) {
    remoteArea
      ?.querySelectorAll(
        `li[${TAKECONTROL_ITEM_ATTR}]`
      )
      .forEach((item) =>
        item.remove()
      );
  }

  function insertTakeControlMenuItem(
    menu,
    assetId,
    takeControlUrl
  ) {
    const takeControlItem =
      document.createElement('li');

    takeControlItem.setAttribute(
      TAKECONTROL_ITEM_ATTR,
      'true'
    );

    takeControlItem.setAttribute(
      'data-asset-id',
      assetId
    );

    const takeControlAnchor =
      document.createElement('a');

    takeControlAnchor.href =
      takeControlUrl;

    takeControlAnchor.target =
      '_self';

    takeControlAnchor.rel =
      'noopener noreferrer';

    takeControlAnchor.textContent =
      'Take Control';

    takeControlAnchor.addEventListener(
      'click',
      (event) => {
        /*
         * Mobile/touch devices use the real browser link.
         * This preserves normal tap behavior.
         */
        if (shouldUseNativeNavigation(event)) {
          return;
        }

        /*
         * Desktop uses Tampermonkey's controlled tab
         * so we can explicitly close it after 3 seconds.
         */
        event.preventDefault();

        openTakeControlLaunchPage(
          takeControlUrl
        );
      }
    );

    takeControlItem.appendChild(
      takeControlAnchor
    );

    const screenConnectItem =
      findScreenConnectItem(menu);

    if (screenConnectItem) {
      menu.insertBefore(
        takeControlItem,
        screenConnectItem
      );
    } else {
      menu.insertBefore(
        takeControlItem,
        menu.firstElementChild
      );
    }
  }

  async function processAssetLink(assetLink) {
    const assetId =
      getAssetIdFromUrl(
        assetLink.href
      );

    if (!assetId) {
      return;
    }

    const assetPanel =
      findAssetPanel(
        assetLink,
        assetId
      );

    if (!assetPanel) {
      return;
    }

    const remoteArea =
      findRemoteAccessArea(
        assetPanel,
        assetId
      );

    if (!remoteArea) {
      return;
    }

    removeExistingTakeControlItem(
      remoteArea
    );

    const takeControlUrl =
      await fetchTakeControlLinkFromAsset(
        assetLink.href
      );

    if (!takeControlUrl) {
      remoteArea.querySelectorAll('[data-tns-takecontrol-chat-dropdown]').forEach(group => group.remove());
      return;
    }

    const menu =
      getOrCreateDropdownMenu(
        remoteArea
      );

    if (!menu) {
      return;
    }

    if (
      menu.querySelector(
        `li[${TAKECONTROL_ITEM_ATTR}][data-asset-id="${assetId}"]`
      )
    ) {
      return;
    }

    insertTakeControlMenuItem(
      menu,
      assetId,
      takeControlUrl
    );
  }

  function getVisibleAssetLinks() {
    const links = Array.from(
      document.querySelectorAll(
        'a[href*="/customer_assets/"]'
      )
    ).filter(isAssetViewLink);

    const unique =
      new Map();

    links.forEach((link) => {
      const assetId =
        getAssetIdFromUrl(
          link.href
        );

      if (!assetId) {
        return;
      }

      unique.set(
        assetId,
        link
      );
    });

    return Array.from(
      unique.values()
    );
  }

  async function processChatAssetPanels() {
    if (
      document.body?.dataset?.currentPage !==
      'chats-show'
    ) {
      return;
    }

    const assetLinks =
      getVisibleAssetLinks();

    for (const assetLink of assetLinks) {
      await processAssetLink(assetLink);
    }
  }

  let pending = false;

  function scheduleProcessChatAssetPanels() {
    if (pending) {
      return;
    }

    pending = true;

    window.setTimeout(() => {
      pending = false;

      processChatAssetPanels();
    }, 600);
  }

  scheduleProcessChatAssetPanels();

  window.addEventListener(
    'load',
    scheduleProcessChatAssetPanels
  );

  const observer =
    new MutationObserver(
      scheduleProcessChatAssetPanels
    );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );
})();

// Original handler: Syncro Tickets - Add TakeControl to Attached Asset Dropdown.js
(function () {
  'use strict';

  const TAKECONTROL_ITEM_ATTR =
    'data-tns-takecontrol-ticket-menu-item';

  const ASSET_LINK_SELECTOR =
    'a[href*="/customer_assets/"]';


  const assetLinkCache =
    new Map();

  function normalizeUrl(value) {
    // Keep Base64 case and padding intact. Only accept a single endpoint command.
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    const match = trimmed.match(/^mspasp:\/\/([A-Za-z0-9+/]+={0,2})$/i);
    if (!match || match[1].length > 2048 || match[1].length % 4 !== 0) return '';
    try {
      const command = atob(match[1]);
      if (btoa(command) !== match[1] || !/^-s [A-Za-z0-9_-]+$/.test(command)) return '';
      return 'mspasp://' + match[1];
    } catch {
      return '';
    }
  }

  function isMobileLikeDevice() {
    if (
      navigator.userAgentData?.mobile ===
      true
    ) {
      return true;
    }

    if (
      /Android|iPhone|iPad|iPod|Mobile/i.test(
        navigator.userAgent
      )
    ) {
      return true;
    }

    return (
      navigator.maxTouchPoints > 0 &&
      window.matchMedia(
        '(pointer: coarse)'
      ).matches
    );
  }

  function shouldUseNativeNavigation(event) {
    return (
      isMobileLikeDevice() ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  function openTakeControlLaunchPage(takeControlUrl) {
    const link = normalizeUrl(takeControlUrl);
    if (!link) return;
    // Launch synchronously from the click so the browser can open its handler.
    // The installed console handles technician sign-in and endpoint authorization.
    window.location.assign(link);
  }

  function decodeHtml(value) {
    const textarea =
      document.createElement(
        'textarea'
      );

    textarea.innerHTML =
      value ||
      '';

    return textarea.value;
  }

  function getAssetIdFromUrl(url) {
    try {
      const parsed =
        new URL(
          url,
          window.location.origin
        );

      const match =
        parsed.pathname.match(
          /^\/customer_assets\/(\d+)\/?$/
        );

      return (
        match ?
          match[1] :
          ''
      );
    } catch {
      return '';
    }
  }

  function isAssetViewLink(anchor) {
    if (!anchor?.href) {
      return false;
    }

    try {
      const url =
        new URL(
          anchor.href,
          window.location.origin
        );

      return (
        /^\/customer_assets\/\d+\/?$/.test(
          url.pathname
        )
      );
    } catch {
      return false;
    }
  }

  function findValueByKey(
    object,
    targetKey
  ) {
    if (
      !object ||
      typeof object !== 'object'
    ) {
      return '';
    }

    if (
      Object.prototype.hasOwnProperty.call(
        object,
        targetKey
      )
    ) {
      return (
        object[targetKey] ||
        ''
      );
    }

    for (
      const value of
      Object.values(object)
    ) {
      const found =
        findValueByKey(
          value,
          targetKey
        );

      if (found) {
        return found;
      }
    }

    return '';
  }

  function getTakeControlLinkFromAssetDocument(assetDoc, rawHtml = '', expectedAssetId = '') {
    const expected = String(expectedAssetId);
    if (!/^\d+$/.test(expected)) return '';
    const rowScoped = assetDoc.nodeType === 1 && assetDoc.matches('tr, [role="row"]');
    const propNodes = [
      ...(assetDoc.nodeType === 1 && assetDoc.matches('[data-react-props], [data-props]') ? [assetDoc] : []),
      ...assetDoc.querySelectorAll('[data-react-props], [data-props]')
    ];
    let identifiedRecords = false;
    let rowValue = '';

    function findAssetRecord(object) {
      if (!object || typeof object !== 'object') return null;
      // Traverse records by identity; never search recursively for the field name.
      const hasFields = Object.prototype.hasOwnProperty.call(object, 'properties') ||
        Object.prototype.hasOwnProperty.call(object, 'new_properties');
      const id = object.id ?? object.asset_id ?? object.assetId;
      if (hasFields && id != null) {
        identifiedRecords = true;
        if (String(id) === expected) return object;
      }
      for (const child of Object.values(object)) {
        const record = findAssetRecord(child);
        if (record) return record;
      }
      return null;
    }

    function readOwnField(record) {
      for (const fields of [record.properties, record.new_properties]) {
        if (fields && Object.prototype.hasOwnProperty.call(fields, 'Take Control Link')) {
          return normalizeUrl(fields['Take Control Link']);
        }
      }
      return '';
    }

    for (const node of propNodes) {
      try {
        const props = JSON.parse(node.getAttribute('data-react-props') || node.getAttribute('data-props') || '{}');
        const record = findAssetRecord(props);
        // A matched asset with a missing/empty field is authoritative.
        if (record) return readOwnField(record);
        if (rowScoped) {
          for (const candidate of [props.asset, props]) {
            if (candidate && candidate.id == null && candidate.asset_id == null && candidate.assetId == null) {
              rowValue ||= readOwnField(candidate);
            }
          }
        }
      } catch { /* Invalid component data is not a source of remote links. */ }
    }
    if (identifiedRecords) return '';
    if (rowScoped && rowValue) return rowValue;

    // With no embedded asset records, the explicit field on the requested asset
    // page (or the already-identified row) is the only remaining permitted source.
    const fieldCell = assetDoc.querySelector('td[data-testid="Take Control Link"]');
    if (!fieldCell) return '';
    for (const anchor of fieldCell.querySelectorAll('a[href]')) {
      const value = normalizeUrl(anchor.getAttribute('href'));
      if (value) return value;
    }
    return normalizeUrl(fieldCell.textContent);
  }

  async function fetchTakeControlLinkFromAsset(
    assetUrl
  ) {
    const normalizedAssetUrl =
      new URL(assetUrl, window.location.origin).href;

    if (!normalizedAssetUrl) {
      return '';
    }

    if (
      assetLinkCache.has(
        normalizedAssetUrl
      )
    ) {
      return await assetLinkCache.get(
        normalizedAssetUrl
      );
    }

    const promise =
      fetch(
        normalizedAssetUrl,
        {
          method: 'GET',
          credentials:
            'same-origin'
        }
      )
        .then(
          async (response) => {
            if (
              !response.ok
            ) {
              throw new Error(
                `Asset page returned HTTP ${response.status}`
              );
            }

            if (response.url && getAssetIdFromUrl(response.url) !== getAssetIdFromUrl(normalizedAssetUrl)) return '';
            const html =
              await response.text();

            const assetDoc =
              new DOMParser().parseFromString(
                html,
                'text/html'
              );

            return getTakeControlLinkFromAssetDocument(assetDoc, html, getAssetIdFromUrl(normalizedAssetUrl));
          }
        )
        .catch(
          (error) => {
            console.warn(
              '[TakeControl Ticket Button] Could not fetch asset page:',
              normalizedAssetUrl,
              error
            );

            return '';
          }
        );

    assetLinkCache.set(
      normalizedAssetUrl,
      promise
    );

    return await promise;
  }

  function getNameCell(
    assetLink
  ) {
    return assetLink.closest(
      'td, [role="cell"], .MuiTableCell-root'
    );
  }

  function getRemoteCell(
    assetLink
  ) {
    const nameCell =
      getNameCell(
        assetLink
      );

    if (
      nameCell?.nextElementSibling
    ) {
      return (
        nameCell.nextElementSibling
      );
    }

    const row =
      assetLink.closest(
        'tr, [role="row"], .MuiTableRow-root'
      );

    if (!row) {
      return null;
    }

    return (
      row
        .querySelector(
          'td a[href*="/remote_access"]'
        )
        ?.closest(
          'td, [role="cell"], .MuiTableCell-root'
        ) ||
      row
        .querySelector(
          'td .dropdown-toggle'
        )
        ?.closest(
          'td, [role="cell"], .MuiTableCell-root'
        ) ||
      null
    );
  }

  function removeExistingTakeControlItem(
    remoteCell
  ) {
    remoteCell
      ?.querySelectorAll(
        `li[${TAKECONTROL_ITEM_ATTR}]`
      )
      .forEach(
        (item) =>
          item.remove()
      );
  }

  function findScreenConnectItem(
    menu
  ) {
    return Array.from(
      menu.querySelectorAll(
        'li'
      )
    ).find((li) =>
      /screenconnect/i.test(
        li.textContent || ''
      )
    );
  }

  function getOrCreateDropdownMenu(
    remoteCell,
    assetId
  ) {
    let menu =
      remoteCell.querySelector(
        'ul.dropdown-menu'
      );

    if (menu) {
      return menu;
    }

    const remoteButton =
      remoteCell.querySelector(
        `a[href*="/customer_assets/${assetId}/remote_access"]`
      ) ||
      remoteCell.querySelector(
        'a[href*="/remote_access"]'
      ) ||
      remoteCell.querySelector(
        '.btn'
      );

    if (!remoteButton) {
      return null;
    }

    const dropdownGroup =
      document.createElement(
        'div'
      );

    dropdownGroup.className =
      'btn-group';

    dropdownGroup.setAttribute('data-tns-takecontrol-ticket-dropdown', 'true');

    dropdownGroup.innerHTML = `
      <a class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown" href="#">
        &nbsp;<span class="caret"></span>
      </a>
      <ul class="dropdown-menu dropdown-menu-right"></ul>
    `;

    const parentGroup =
      remoteButton.closest(
        '.btn-group'
      );

    if (parentGroup) {
      parentGroup.appendChild(
        dropdownGroup
      );
    } else {
      remoteButton.insertAdjacentElement(
        'afterend',
        dropdownGroup
      );
    }

    return dropdownGroup.querySelector(
      'ul.dropdown-menu'
    );
  }

  function addTakeControlToRemoteDropdown(
    assetLink,
    takeControlUrl
  ) {
    const assetId =
      getAssetIdFromUrl(
        assetLink.href
      );

    if (!assetId) {
      return;
    }

    const remoteCell =
      getRemoteCell(
        assetLink
      );

    if (!remoteCell) {
      return;
    }

    removeExistingTakeControlItem(
      remoteCell
    );

    if (!takeControlUrl) {
      remoteCell.querySelectorAll('[data-tns-takecontrol-ticket-dropdown]').forEach(group => group.remove());
      return;
    }

    const menu =
      getOrCreateDropdownMenu(
        remoteCell,
        assetId
      );

    if (!menu) {
      return;
    }

    const takeControlItem =
      document.createElement(
        'li'
      );

    takeControlItem.setAttribute(
      TAKECONTROL_ITEM_ATTR,
      'true'
    );

    const takeControlAnchor =
      document.createElement(
        'a'
      );

    takeControlAnchor.href =
      takeControlUrl;

    takeControlAnchor.target =
      '_self';

    takeControlAnchor.rel =
      'noopener noreferrer';

    takeControlAnchor.textContent =
      'Take Control';

    takeControlAnchor.addEventListener(
      'click',
      (event) => {
        if (
          shouldUseNativeNavigation(
            event
          )
        ) {
          return;
        }

        event.preventDefault();

        openTakeControlLaunchPage(
          takeControlAnchor.href
        );
      }
    );

    takeControlItem.appendChild(
      takeControlAnchor
    );

    const screenConnectItem =
      findScreenConnectItem(
        menu
      );

    if (screenConnectItem) {
      menu.insertBefore(
        takeControlItem,
        screenConnectItem
      );
    } else {
      menu.insertBefore(
        takeControlItem,
        menu.firstElementChild
      );
    }
  }

  function getAttachedAssetLinks() {
    const uniqueLinks =
      new Map();

    document
      .querySelectorAll(
        ASSET_LINK_SELECTOR
      )
      .forEach(
        (anchor) => {
          if (
            !isAssetViewLink(
              anchor
            )
          ) {
            return;
          }

          const assetId =
            getAssetIdFromUrl(
              anchor.href
            );

          if (!assetId) {
            return;
          }

          const row =
            anchor.closest(
              'tr, [role="row"], .MuiTableRow-root'
            );

          if (!row) {
            return;
          }

          const remoteCell =
            getRemoteCell(
              anchor
            );

          if (!remoteCell) {
            return;
          }

          uniqueLinks.set(
            assetId,
            anchor
          );
        }
      );

    return Array.from(
      uniqueLinks.values()
    );
  }

  async function processAttachedAssets() {
    if (!location.pathname.startsWith("/tickets/")) return;
    const assetLinks =
      getAttachedAssetLinks();

    for (
      const assetLink of
      assetLinks
    ) {
      const takeControlUrl =
        await fetchTakeControlLinkFromAsset(
          assetLink.href
        );

      addTakeControlToRemoteDropdown(
        assetLink,
        takeControlUrl
      );
    }
  }

  let pending = false;

  function scheduleProcessAttachedAssets() {
    if (pending) {
      return;
    }

    pending = true;

    window.setTimeout(() => {
      pending = false;

      processAttachedAssets();
    }, 500);
  }

  scheduleProcessAttachedAssets();

  window.addEventListener(
    'load',
    scheduleProcessAttachedAssets
  );

  const observer =
    new MutationObserver(
      scheduleProcessAttachedAssets
    );

  observer.observe(
    document.body,
    {
      childList: true,
      subtree: true
    }
  );
})();

// Customers and RMM Alerts: original-style split dropdowns.
(function () {
  'use strict';
  const assetLinkCache = new Map();
  function normalizeUrl(value) {
    // Keep Base64 case and padding intact. Only accept a single endpoint command.
    if (typeof value !== 'string') return '';
    const trimmed = value.trim();
    const match = trimmed.match(/^mspasp:\/\/([A-Za-z0-9+/]+={0,2})$/i);
    if (!match || match[1].length > 2048 || match[1].length % 4 !== 0) return '';
    try {
      const command = atob(match[1]);
      if (btoa(command) !== match[1] || !/^-s [A-Za-z0-9_-]+$/.test(command)) return '';
      return 'mspasp://' + match[1];
    } catch {
      return '';
    }
  }

  function isMobileLikeDevice() {
    if (
      navigator.userAgentData?.mobile ===
      true
    ) {
      return true;
    }

    if (
      /Android|iPhone|iPad|iPod|Mobile/i.test(
        navigator.userAgent
      )
    ) {
      return true;
    }

    return (
      navigator.maxTouchPoints > 0 &&
      window.matchMedia(
        '(pointer: coarse)'
      ).matches
    );
  }

  function shouldUseNativeNavigation(event) {
    return (
      isMobileLikeDevice() ||
      event.button !== 0 ||
      event.ctrlKey ||
      event.metaKey ||
      event.shiftKey ||
      event.altKey
    );
  }

  function openTakeControlLaunchPage(takeControlUrl) {
    const link = normalizeUrl(takeControlUrl);
    if (!link) return;
    // Launch synchronously from the click so the browser can open its handler.
    // The installed console handles technician sign-in and endpoint authorization.
    window.location.assign(link);
  }

  function decodeHtml(value) {
    const textarea =
      document.createElement(
        'textarea'
      );

    textarea.innerHTML =
      value ||
      '';

    return textarea.value;
  }

  function getAssetIdFromUrl(url) {
    try {
      const parsed =
        new URL(
          url,
          window.location.origin
        );

      const match =
        parsed.pathname.match(
          /^\/customer_assets\/(\d+)\/?$/
        );

      return (
        match ?
          match[1] :
          ''
      );
    } catch {
      return '';
    }
  }

  function findValueByKey(
    object,
    targetKey
  ) {
    if (
      !object ||
      typeof object !== 'object'
    ) {
      return '';
    }

    if (
      Object.prototype.hasOwnProperty.call(
        object,
        targetKey
      )
    ) {
      return (
        object[targetKey] ||
        ''
      );
    }

    for (
      const value of
      Object.values(object)
    ) {
      const found =
        findValueByKey(
          value,
          targetKey
        );

      if (found) {
        return found;
      }
    }

    return '';
  }

  function getTakeControlLinkFromAssetDocument(assetDoc, rawHtml = '', expectedAssetId = '') {
    const expected = String(expectedAssetId);
    if (!/^\d+$/.test(expected)) return '';
    const rowScoped = assetDoc.nodeType === 1 && assetDoc.matches('tr, [role="row"]');
    const propNodes = [
      ...(assetDoc.nodeType === 1 && assetDoc.matches('[data-react-props], [data-props]') ? [assetDoc] : []),
      ...assetDoc.querySelectorAll('[data-react-props], [data-props]')
    ];
    let identifiedRecords = false;
    let rowValue = '';

    function findAssetRecord(object) {
      if (!object || typeof object !== 'object') return null;
      // Traverse records by identity; never search recursively for the field name.
      const hasFields = Object.prototype.hasOwnProperty.call(object, 'properties') ||
        Object.prototype.hasOwnProperty.call(object, 'new_properties');
      const id = object.id ?? object.asset_id ?? object.assetId;
      if (hasFields && id != null) {
        identifiedRecords = true;
        if (String(id) === expected) return object;
      }
      for (const child of Object.values(object)) {
        const record = findAssetRecord(child);
        if (record) return record;
      }
      return null;
    }

    function readOwnField(record) {
      for (const fields of [record.properties, record.new_properties]) {
        if (fields && Object.prototype.hasOwnProperty.call(fields, 'Take Control Link')) {
          return normalizeUrl(fields['Take Control Link']);
        }
      }
      return '';
    }

    for (const node of propNodes) {
      try {
        const props = JSON.parse(node.getAttribute('data-react-props') || node.getAttribute('data-props') || '{}');
        const record = findAssetRecord(props);
        // A matched asset with a missing/empty field is authoritative.
        if (record) return readOwnField(record);
        if (rowScoped) {
          for (const candidate of [props.asset, props]) {
            if (candidate && candidate.id == null && candidate.asset_id == null && candidate.assetId == null) {
              rowValue ||= readOwnField(candidate);
            }
          }
        }
      } catch { /* Invalid component data is not a source of remote links. */ }
    }
    if (identifiedRecords) return '';
    if (rowScoped && rowValue) return rowValue;

    // With no embedded asset records, the explicit field on the requested asset
    // page (or the already-identified row) is the only remaining permitted source.
    const fieldCell = assetDoc.querySelector('td[data-testid="Take Control Link"]');
    if (!fieldCell) return '';
    for (const anchor of fieldCell.querySelectorAll('a[href]')) {
      const value = normalizeUrl(anchor.getAttribute('href'));
      if (value) return value;
    }
    return normalizeUrl(fieldCell.textContent);
  }

  async function fetchTakeControlLinkFromAsset(
    assetUrl
  ) {
    const normalizedAssetUrl =
      new URL(assetUrl, window.location.origin).href;

    if (!normalizedAssetUrl) {
      return '';
    }

    if (
      assetLinkCache.has(
        normalizedAssetUrl
      )
    ) {
      return await assetLinkCache.get(
        normalizedAssetUrl
      );
    }

    const promise =
      fetch(
        normalizedAssetUrl,
        {
          method: 'GET',
          credentials:
            'same-origin'
        }
      )
        .then(
          async (response) => {
            if (
              !response.ok
            ) {
              throw new Error(
                `Asset page returned HTTP ${response.status}`
              );
            }

            if (response.url && getAssetIdFromUrl(response.url) !== getAssetIdFromUrl(normalizedAssetUrl)) return '';
            const html =
              await response.text();

            const assetDoc =
              new DOMParser().parseFromString(
                html,
                'text/html'
              );

            return getTakeControlLinkFromAssetDocument(assetDoc, html, getAssetIdFromUrl(normalizedAssetUrl));
          }
        )
        .catch(
          (error) => {
            console.warn(
              '[TakeControl Ticket Button] Could not fetch asset page:',
              normalizedAssetUrl,
              error
            );

            return '';
          }
        );

    assetLinkCache.set(
      normalizedAssetUrl,
      promise
    );

    return await promise;
  }


    const ITEM_ATTR = 'data-tns-takecontrol-table-menu-item';
    const GROUP_ATTR = 'data-tns-takecontrol-table-dropdown';
    let pending = false;

    function isSupportedPage() {
      return /^\/customers\/\d+\/?$/.test(location.pathname) ||
        /^\/rmm_alerts(?:\/|$)/.test(location.pathname);
    }

    function getRowAsset(row) {
      for (const anchor of row.querySelectorAll('a[href]')) {
        try {
          const url = new URL(anchor.getAttribute('href'), window.location.origin);
          if (url.origin !== window.location.origin) continue;
          const match = url.pathname.match(/^\/customer_assets\/(\d+)(?:\/remote_access)?\/?$/);
          if (match) return { id: match[1], url: `${url.origin}/customer_assets/${match[1]}` };
        } catch { /* Ignore non-URL controls. */ }
      }
      const id = row.getAttribute('data-asset-id') ||
        row.getAttribute('data-testid')?.match(/^asset-row-(\d+)$/)?.[1];
      return /^\d+$/.test(id || '') ?
        { id, url: `${window.location.origin}/customer_assets/${id}` } : null;
    }

    function getRemoteCell(row, assetId) {
      const cells = Array.from(row.children).filter(cell => cell.matches('td, th, [role="cell"]'));
      // Match the actual control before relying on column positions. An icon
      // column may be separate even though the Name header spans both columns.
      const remoteControl = row.querySelector(
        `a[href*="/customer_assets/${assetId}/remote_access"], .btn-remote-access`
      ) || Array.from(row.querySelectorAll('a, button')).find(control =>
        /remote access/i.test([
          control.textContent, control.getAttribute('title'),
          control.getAttribute('data-original-title'), control.getAttribute('aria-label')
        ].join(' '))
      );
      if (remoteControl) {
        const cell = remoteControl.closest('td, [role="cell"]');
        if (cell && cells.includes(cell)) return cell;
      }
      const table = row.closest('table');
      for (const headerRow of table?.querySelectorAll('tr') || []) {
        if (headerRow.closest('table') !== table || headerRow === row) continue;
        const headers = Array.from(headerRow.children).filter(cell => cell.matches('th, td'));
        let column = 0;
        for (const header of headers) {
          if (/^remote(?:\s+access)?$/i.test(header.textContent.trim())) {
            let cellColumn = 0;
            for (const cell of cells) {
              const width = Number(cell.getAttribute('colspan')) || 1;
              if (column >= cellColumn && column < cellColumn + width) return cell;
              cellColumn += width;
            }
          }
          column += Number(header.getAttribute('colspan')) || 1;
        }
      }
      return null;
    }

    function getOrCreateMenu(remoteCell, assetId) {
      const remoteButton = remoteCell.querySelector(
        `a[href*="/customer_assets/${assetId}/remote_access"], .btn-remote-access`
      ) || Array.from(remoteCell.querySelectorAll('a.btn, button.btn')).find(button =>
        !button.closest(`[${GROUP_ATTR}]`) && !/background/i.test(button.textContent)
      );
      let ownGroup = remoteCell.querySelector(`[${GROUP_ATTR}]`);
      const nextGroup = remoteButton?.nextElementSibling;
      const nativeMenu = nextGroup?.matches('.btn-group') && !nextGroup.hasAttribute(GROUP_ATTR) &&
        !/background/i.test(nextGroup.textContent) ? nextGroup.querySelector(':scope > ul.dropdown-menu') : null;
      const parentMenu = remoteButton?.closest('.btn-group')?.querySelector(':scope > ul.dropdown-menu');
      const menu = nativeMenu || parentMenu;
      if (menu && !ownGroup?.contains(menu)) {
        ownGroup?.remove();
        return menu;
      }
      if (!ownGroup) {
        ownGroup = document.createElement('div');
        ownGroup.className = 'btn-group';
        ownGroup.setAttribute(GROUP_ATTR, 'true');
        ownGroup.innerHTML = `
          <a class="btn btn-default btn-sm dropdown-toggle" data-toggle="dropdown" href="#"
             role="button" aria-haspopup="true" aria-label="Remote Access options" title="Remote Access options">
            &nbsp;<span class="caret"></span>
          </a>
          <ul class="dropdown-menu dropdown-menu-right"></ul>`;
        if (remoteButton) remoteButton.insertAdjacentElement('afterend', ownGroup);
        else remoteCell.appendChild(ownGroup);
      }
      return ownGroup.querySelector('ul.dropdown-menu');
    }

    async function processRows() {
      const pagePath = location.pathname;
      for (const row of document.querySelectorAll('table tr')) {
        if (!isSupportedPage() || location.pathname !== pagePath) return;
        const asset = getRowAsset(row);
        if (!asset) continue;
        const remoteCell = getRemoteCell(row, asset.id);
        if (!remoteCell) continue;
        const takeControlUrl = getTakeControlLinkFromAssetDocument(row, '', asset.id) ||
          await fetchTakeControlLinkFromAsset(asset.url);
        // A slow lookup must not attach the previous asset's link to a reused row.
        if (!row.isConnected || location.pathname !== pagePath ||
            getRowAsset(row)?.id !== asset.id || getRemoteCell(row, asset.id) !== remoteCell) continue;
        // Retain the original scripts' remove/recreate behavior on each redraw.
        remoteCell.querySelectorAll(`[${ITEM_ATTR}], [data-tns-takecontrol-table-button]`)
          .forEach(item => item.remove());
        if (!takeControlUrl) {
          remoteCell.querySelectorAll(`[${GROUP_ATTR}]`).forEach(group => group.remove());
          continue;
        }
        const menu = getOrCreateMenu(remoteCell, asset.id);
        const item = document.createElement('li');
        item.setAttribute(ITEM_ATTR, asset.id);
        const anchor = document.createElement('a');
        anchor.href = takeControlUrl;
        anchor.target = '_self';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = 'Take Control';
        anchor.addEventListener('click', event => {
          if (shouldUseNativeNavigation(event)) return;
          event.preventDefault();
          openTakeControlLaunchPage(anchor.href);
        });
        item.appendChild(anchor);
        const screenConnect = Array.from(menu.querySelectorAll('li')).find(li =>
          /screen\s*connect/i.test(li.textContent)
        );
        menu.insertBefore(item, screenConnect || menu.firstElementChild);
      }
    }

    function schedule() {
      if (!isSupportedPage() || pending) return;
      pending = true;
      window.setTimeout(() => {
        pending = false;
        if (isSupportedPage()) processRows().catch(error =>
          console.warn('[TakeControl Tables] Could not update remote controls:', error)
        );
      }, 500);
    }
    schedule();
    window.addEventListener('load', schedule);
    window.addEventListener('popstate', schedule);
    document.addEventListener('turbolinks:load', schedule);
    document.addEventListener('turbo:load', schedule);
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  })();



