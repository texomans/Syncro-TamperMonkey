
// ==UserScript==
// @name         Syncro Registry Editor Scroll Fix
// @namespace    https://texomans.com/
// @version      1.2.2
// @description  Restores independent scrolling in Syncro Live's registry tree and values panes.
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
  const LEFT_MIN_WIDTH = 180;
  const LEFT_MAX_WIDTH = 350;

  let scheduled = false;
  let cachedRegistry = null;

  function isScrollable(element) {
    if (!(element instanceof HTMLElement)) return false;
    const overflow = getComputedStyle(element).overflowY;
    return overflow === 'auto' || overflow === 'scroll';
  }

  function getRegistryLayout(element) {
    if (!(element instanceof HTMLElement)) return null;
    if (getComputedStyle(element).display !== 'grid') return null;

    const children = Array.from(element.children).filter(
      (child) => child instanceof HTMLElement && isScrollable(child)
    );
    if (children.length !== 2) return null;

    const [first, second] = children;
    const firstRect = first.getBoundingClientRect();
    const secondRect = second.getBoundingClientRect();

    // The registry tree is the ~250px left column; the values pane is wider.
    // Match the actual sibling panes rather than walking up from the path input:
    // Syncro may move that input into a different React grid branch.
    if (
      firstRect.width < LEFT_MIN_WIDTH ||
      firstRect.width > LEFT_MAX_WIDTH ||
      firstRect.height < MIN_PANE_HEIGHT ||
      secondRect.width <= firstRect.width * 1.2 ||
      secondRect.height < MIN_PANE_HEIGHT ||
      Math.abs(firstRect.top - secondRect.top) > 24 ||
      secondRect.left < firstRect.right - 24
    ) {
      return null;
    }

    return { layout: element, leftPane: first, rightPane: second };
  }

  function findRegistryLayout() {
    // Only operate on the Registry Editor, never other Syncro Live tools.
    if (!document.querySelector(PATH_INPUT_SELECTOR)) return null;

    if (cachedRegistry && cachedRegistry.layout.isConnected) {
      const match = getRegistryLayout(cachedRegistry.layout);
      if (match) return match;
    }

    // The two 12,000px panes are direct children of a grid, but the path
    // input is no longer necessarily inside that grid's ancestor chain.
    // Scan for the real pane pair and cache it to keep later passes cheap.
    for (const candidate of document.querySelectorAll('div')) {
      const match = getRegistryLayout(candidate);
      if (match) {
        cachedRegistry = match;
        return match;
      }
    }

    cachedRegistry = null;
    return null;
  }

  function findViewportHost(layout) {
    let parent = layout.parentElement;
    while (parent && parent !== document.body) {
      const rect = parent.getBoundingClientRect();
      if (isScrollable(parent) && rect.height >= MIN_PANE_HEIGHT) {
        return parent;
      }
      parent = parent.parentElement;
    }
    return null;
  }

  function setImportant(element, property, value) {
    if (
      element.style.getPropertyValue(property) !== value ||
      element.style.getPropertyPriority(property) !== 'important'
    ) {
      element.style.setProperty(property, value, 'important');
    }
  }

  function constrainPane(pane) {
    setImportant(pane, 'height', '100%');
    setImportant(pane, 'max-height', '100%');
    setImportant(pane, 'min-height', '0');
    setImportant(pane, 'overflow-y', 'auto');
    setImportant(pane, 'box-sizing', 'border-box');
  }

  function applyFix() {
    const registry = findRegistryLayout();
    if (!registry) return;

    const { layout, leftPane, rightPane } = registry;
    const layoutRect = layout.getBoundingClientRect();
    const viewportHost = findViewportHost(layout);

    let availableHeight = window.innerHeight - layoutRect.top - BOTTOM_GAP;

    if (viewportHost) {
      const hostRect = viewportHost.getBoundingClientRect();

      // Convert the grid's screen coordinate into the scroll host's CONTENT
      // coordinate. This still works when the outer host was already scrolled
      // far down because Syncro expanded the registry grid to 12,000px.
      const topWithinHost =
        layoutRect.top - hostRect.top - viewportHost.clientTop +
        viewportHost.scrollTop;

      availableHeight = Math.min(
        availableHeight,
        viewportHost.clientHeight - topWithinHost - BOTTOM_GAP
      );
    }

    availableHeight = Math.floor(availableHeight);
    if (!Number.isFinite(availableHeight) || availableHeight < MIN_PANE_HEIGHT) {
      return;
    }

    // Give the shared grid a real height, so the individual panes can scroll
    // inside it instead of making the entire page thousands of pixels tall.
    const height = `${availableHeight}px`;
    setImportant(layout, 'height', height);
    setImportant(layout, 'max-height', height);
    setImportant(layout, 'min-height', '0');
    setImportant(layout, 'overflow', 'hidden');
    setImportant(layout, 'box-sizing', 'border-box');

    constrainPane(leftPane);
    constrainPane(rightPane);

    // Let Syncro's surrounding grid wrappers shrink to their contents.
    // Do not force arbitrary ancestor heights to 100%.
    let parent = layout.parentElement;
    for (let i = 0; parent && parent !== document.body && i < 6; i++) {
      setImportant(parent, 'min-height', '0');
      parent = parent.parentElement;
    }
  }

  function scheduleFix() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      applyFix();
    });
  }

  scheduleFix();
  window.addEventListener('load', scheduleFix);
  window.addEventListener('resize', scheduleFix);

  // Syncro Live renders the registry asynchronously in React.
  // Watching child additions/removals catches view switches and re-renders
  // without creating loops from our own inline style changes.
  const observer = new MutationObserver(scheduleFix);
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
