// ==UserScript==
// @name         Syncro Registry Editor Scroll Fix
// @namespace    https://syncromsp.com/
// @version      1.1.0
// @description  Fixes broken independent scrolling in Syncro Live Registry Editor panes.
// @match        https://syncro-live.syncromsp.com/registry-editor*
// @run-at       document-idle
// @grant        GM_addStyle
// ==/UserScript==

(function () {
  'use strict';

  const css = `
    html,
    body,
    #app {
      height: 100% !important;
      min-height: 0 !important;
    }

    #app [tabindex="-1"] {
      height: 100% !important;
      min-height: 0 !important;
    }

    div:has(div.sc-jwKygS),
    div:has(div.task-page) {
      height: 100% !important;
      min-height: 0 !important;
    }

    #app div {
      min-height: 0 !important;
    }

    #app [style*="overflow-y: auto"],
    #app [style*="overflow: auto"],
    #app [style*="overflow-y:auto"],
    #app [style*="overflow:auto"] {
      min-height: 0 !important;
    }
  `;

  GM_addStyle(css);

  function applyFix() {
    document.documentElement.style.setProperty('height', '100%', 'important');

    if (document.body) {
      document.body.style.setProperty('height', '100%', 'important');
      document.body.style.setProperty('min-height', '0', 'important');
    }

    const app = document.querySelector('#app');
    if (app) {
      app.style.setProperty('height', '100%', 'important');
      app.style.setProperty('min-height', '0', 'important');
    }

    document.querySelectorAll('#app [tabindex="-1"]').forEach((el) => {
      el.style.setProperty('height', '100%', 'important');
      el.style.setProperty('min-height', '0', 'important');
    });

    document.querySelectorAll('div').forEach((el) => {
      if (el.querySelector('div.sc-jwKygS, div.task-page')) {
        el.style.setProperty('height', '100%', 'important');
        el.style.setProperty('min-height', '0', 'important');
      }
    });
  }

  applyFix();

  const observer = new MutationObserver(() => {
    applyFix();
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true
  });
})();
