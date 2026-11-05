// ==UserScript==
// @name         Syncro - HTML Content Dark Mode
// @namespace    https://texomans.com/
// @version      1.0.1
// @description  Darkens incoming HTML content in Syncro Tickets and Leads.
// @match        https://*.syncromsp.com/tickets/*
// @match        https://*.syncromsp.com/leads/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20HTML%20Content%20Dark%20Mode.user.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20HTML%20Content%20Dark%20Mode.user.js
// @run-at       document-end
// @grant        none
// ==/UserScript==

(() => {
    'use strict';

    const style = document.createElement('style');
    style.id = 'syncro-html-content-dark-mode';

    // Apply only while Syncro's dark theme is active.
    const root = `
        :is(html.dark, body.dark)
        .rich-text-comment:not([contenteditable="true"])
    `;

    style.textContent = `
        ${root} {
            background: #262a30 !important;
            color: #e5e7eb !important;
            color-scheme: dark;
        }

        ${root} :where(*) {
            color: #e5e7eb !important;
            background-color: transparent !important;
            background-image: none !important;
            border-color: #50565f !important;
            text-shadow: none !important;
            box-shadow: none !important;
        }

        ${root} a,
        ${root} a :where(*) {
            color: #79c0ff !important;
        }

        ${root} a {
            text-decoration: underline !important;
        }

        ${root} :is(pre, code, blockquote) {
            background-color: #30343b !important;
        }

        /* Keep actual images and logos unchanged. */
        ${root} :is(img, picture, svg, canvas, video) {
            filter: none !important;
        }
    `;

    (document.head || document.documentElement).appendChild(style);
})();
