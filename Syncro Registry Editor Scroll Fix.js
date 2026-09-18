// ==UserScript==
// @name         Syncro Registry Editor Scroll Fix
// @namespace    https://syncromsp.com/
// @version      1.2.0
// @description  Fixes broken independent scrolling in Syncro Live Registry Editor panes.
// @match        https://*.syncromsp.com/registry-editor*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Registry%20Editor%20Scroll%20Fix.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Registry%20Editor%20Scroll%20Fix.js
// @run-at       document-idle
// @grant        none
// ==/UserScript==

(function () {
  'use strict';

  const PATH_INPUT_SELECTOR =
    'input[placeholder="Enter or navigate to registry location."]';

  const MIN_PANE_HEIGHT = 200;
  const BOTTOM_GAP = 8;

  let scheduled = false;

  function isScrollable(element) {
    if (!(element instanceof HTMLElement)) {
      return false;
    }

    const style = window.getComputedStyle(element);

    return (
      style.overflowY === 'auto' ||
      style.overflowY === 'scroll'
    );
  }

  function looksLikeRegistryLayout(element) {
    if (!(element instanceof HTMLElement)) {
      return null;
    }

    const children = Array.from(element.children).filter(
      (child) => child instanceof HTMLElement
    );

    if (children.length < 2) {
      return null;
    }

    const scrollableChildren = children.filter(isScrollable);

    if (scrollableChildren.length < 2) {
      return null;
    }

    /*
     * The registry tree is the narrow scrollable pane on the left.
     * Syncro currently renders it at 250px wide.
     *
     * Use a range instead of an exact width so small Syncro styling
     * changes do not break the script.
     */
    const leftPane = scrollableChildren.find((child) => {
      const width = child.getBoundingClientRect().width;

      return width >= 180 && width <= 350;
    });

    if (!leftPane) {
      return null;
    }

    /*
     * The value table is the other scrollable child.
     */
    const rightPane = scrollableChildren.find(
      (child) => child !== leftPane
    );

    if (!rightPane) {
      return null;
    }

    return {
      layout: element,
      leftPane,
      rightPane
    };
  }

  function findRegistryLayout() {
    const pathInput = document.querySelector(
      PATH_INPUT_SELECTOR
    );

    if (!pathInput) {
      return null;
    }

    /*
     * Walk upward from Syncro's registry-path input.
     *
     * At each level, inspect that element and its immediate
     * children for the split registry pane.
     *
     * This avoids depending on generated styled-components
     * class names such as sc-dqBHgY or sc-jwKygS.
     */
    let current = pathInput;

    for (
      let depth = 0;
      current && current !== document.body && depth < 12;
      depth += 1, current = current.parentElement
    ) {
      const currentMatch = looksLikeRegistryLayout(current);

      if (currentMatch) {
        return currentMatch;
      }

      for (const child of current.children) {
        const childMatch = looksLikeRegistryLayout(child);

        if (childMatch) {
          return childMatch;
        }
      }
    }

    return null;
  }

  function findViewportHost(layout) {
    /*
     * Find Syncro's nearest vertically scrollable ancestor.
     *
     * Current Syncro markup gives this container a viewport-based
     * height of approximately calc(100vh - 50px), but we deliberately
     * do not depend on that exact inline style.
     */
    let current = layout.parentElement;

    while (current && current !== document.body) {
      if (isScrollable(current)) {
        const rect = current.getBoundingClientRect();

        if (rect.height >= MIN_PANE_HEIGHT) {
          return current;
        }
      }

      current = current.parentElement;
    }

    return null;
  }

  function constrainPane(pane) {
    pane.style.setProperty(
      'height',
      '100%',
      'important'
    );

    pane.style.setProperty(
      'max-height',
      '100%',
      'important'
    );

    pane.style.setProperty(
      'min-height',
      '0',
      'important'
    );

    pane.style.setProperty(
      'overflow',
      'auto',
      'important'
    );

    pane.style.setProperty(
      'box-sizing',
      'border-box',
      'important'
    );
  }

  function applyFix() {
    const registry = findRegistryLayout();

    if (!registry) {
      return;
    }

    const {
      layout,
      leftPane,
      rightPane
    } = registry;

    const layoutRect = layout.getBoundingClientRect();
    const viewportHost = findViewportHost(layout);

    /*
     * Prefer the bottom edge of Syncro's content viewport.
     * Fall back to the browser viewport if necessary.
     */
    let availableBottom = window.innerHeight;

    if (viewportHost) {
      const hostRect =
        viewportHost.getBoundingClientRect();

      availableBottom = Math.min(
        availableBottom,
        hostRect.bottom
      );
    }

    const availableHeight = Math.floor(
      availableBottom -
      layoutRect.top -
      BOTTOM_GAP
    );

    if (availableHeight < MIN_PANE_HEIGHT) {
      return;
    }

    /*
     * This is the critical fix.
     *
     * Without a real height, Syncro allows these panes to grow
     * to the full height of their contents (10,000+ px), causing
     * the entire page to scroll instead of the registry panes.
     */
    layout.style.setProperty(
      'height',
      `${availableHeight}px`,
      'important'
    );

    layout.style.setProperty(
      'max-height',
      `${availableHeight}px`,
      'important'
    );

    layout.style.setProperty(
      'min-height',
      '0',
      'important'
    );

    layout.style.setProperty(
      'overflow',
      'hidden',
      'important'
    );

    layout.style.setProperty(
      'box-sizing',
      'border-box',
      'important'
    );

    constrainPane(leftPane);
    constrainPane(rightPane);

    /*
     * Allow the immediate ancestor chain to shrink normally.
     * We deliberately do NOT force all #app divs to height:100%
     * like the previous version did.
     */
    let parent = layout.parentElement;

    for (let i = 0; parent && i < 5; i += 1) {
      parent.style.setProperty(
        'min-height',
        '0',
        'important'
      );

      parent = parent.parentElement;
    }
  }

  function scheduleFix() {
    if (scheduled) {
      return;
    }

    scheduled = true;

    window.requestAnimationFrame(() => {
      scheduled = false;
      applyFix();
    });
  }

  /*
   * Initial attempts. Syncro Live is a React application, so the
   * Registry Editor may not exist yet when document-idle fires.
   */
  scheduleFix();

  window.addEventListener(
    'load',
    scheduleFix
  );

  window.addEventListener(
    'resize',
    scheduleFix
  );

  /*
   * Reapply after React replaces portions of the Registry Editor.
   *
   * Only child-list changes are watched. Our own style changes
   * therefore do not trigger an observer loop.
   */
  const observer = new MutationObserver(
    scheduleFix
  );

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
