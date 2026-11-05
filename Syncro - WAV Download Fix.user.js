// ==UserScript==
// @name         Syncro - WAV Download Fix
// @namespace    https://texomans.com/
// @version      1.1.3
// @description  Save Syncro WAV attachments with the correct audio type and .wav extension.
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20WAV%20Download%20Fix.user.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20WAV%20Download%20Fix.user.js
// @match        https://texomans.shield.syncromsp.com/*
// @grant        GM_registerMenuCommand
// @run-at       document-start
// ==/UserScript==

(() => {
    'use strict';
    // Runs locally in the authenticated Syncro tab. No external service is used.
    // Capture attachment links, verify WAV data, and offer a compact Save WAV card.
    // Non-WAV attachments return to Syncro's normal handling.
    const ORIGIN = 'https://texomans.shield.syncromsp.com';
    const bypass = new WeakSet();
    let busy = false;

    function attachmentURL(value) {
        const url = new URL(value, ORIGIN);
        if (url.origin !== ORIGIN || !/^\/attachments\/\d+\/download_attachment\/?$/.test(url.pathname)) {
            throw new Error('Use a Syncro attachment download link from this account.');
        }
        return url;
    }

    function isWAV(bytes) {
        const text = offset => String.fromCharCode(...bytes.slice(offset, offset + 4));
        return bytes.length >= 12 && ['RIFF', 'RIFX', 'RF64'].includes(text(0)) && text(8) === 'WAVE';
    }

    function filename(disposition, hint, id) {
        let name = '';
        const extended = /filename\*\s*=\s*UTF-8'[^']*'([^;]+)/i.exec(disposition || '');
        if (extended) {
            try { name = decodeURIComponent(extended[1].trim().replace(/^"|"$/g, '')); } catch (_) { /* Try plain filename. */ }
        }
        if (!name) {
            const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/i.exec(disposition || '');
            name = plain ? (plain[1] || plain[2] || '').trim() : '';
        }
        if (!name) name = (hint || '').match(/[^\r\n]+?\.wav(?:\.html?)?/i)?.[0] || `Syncro-attachment-${id}.wav`;
        name = name.replace(/[\\/<>:"|?*\x00-\x1f\x7f]/g, '_').trim();
        name = name.replace(/(?:\.html?)+$/i, '');
        if (!/\.wav$/i.test(name)) name += '.wav';
        return name;
    }

    function panel() {
        const box = document.createElement('div');
        box.style.cssText = `
            position:fixed;
            right:12px;
            bottom:12px;
            width:320px;
            max-width:calc(100vw - 24px);
            box-sizing:border-box;
            z-index:2147483647;
            background:#262a30;
            color:#fff;
            padding:12px;
            border:1px solid #a9c7ff;
            border-radius:10px;
            font:14px/1.4 sans-serif;
            box-shadow:0 4px 16px #0006;
            display:grid;
            grid-template-columns:1fr auto;
            gap:8px;
            align-items:center;
        `;
        const title = document.createElement('strong');
        title.textContent = 'Preparing attachment…';
        const status = document.createElement('p');
        status.style.cssText = `
            grid-column:1 / -1;
            margin:0;
            font-size:12px;
            overflow-wrap:anywhere;
            max-height:54px;
            overflow:auto;
        `;
        const close = document.createElement('button');
        close.textContent = 'Close';
        close.style.cssText = `
            margin:0;
            padding:10px 12px;
            font:inherit;
            border:0;
            border-radius:6px;
            background:#454a52;
            color:#fff;
            cursor:pointer;
        `;
        let objectURL;
        const controller = new AbortController();
        close.onclick = () => {
            controller.abort();
            if (objectURL) URL.revokeObjectURL(objectURL);
            box.remove();
        };
        box.append(title, status, close);
        (document.body || document.documentElement).append(box);
        return {box, title, status, close, controller, setURL: value => { objectURL = value; }};
    }

    async function prepare(value, originalLink) {
        if (busy) return;
        let url;
        try { url = attachmentURL(value); } catch (error) { alert(error.message); return; }
        busy = true;
        const ui = panel();
        const timeout = setTimeout(() => ui.controller.abort(), 60000);
        try {
            const response = await fetch(url.href, {credentials: 'same-origin', signal: ui.controller.signal});
            if (!response.ok) throw new Error(`Syncro returned HTTP ${response.status}.`);
            const buffer = await response.arrayBuffer();
            if (!isWAV(new Uint8Array(buffer))) {
                if (originalLink) {
                    ui.box.remove();
                    bypass.add(originalLink);
                    try {
                        originalLink.click();
                    } finally {
                        bypass.delete(originalLink);
                    }
                    return;
                }
                throw new Error('This response is not WAV audio. Syncro may have returned a sign-in or error page. Nothing was saved.');
            }
            const hint = originalLink
                ? [originalLink.textContent, originalLink.getAttribute('download'), originalLink.title].filter(Boolean).join('\n')
                : '';
            const name = filename(response.headers.get('Content-Disposition'), hint, url.pathname.split('/')[2]);
            // Rebuild the Blob: deliberately discard the server's reported MIME type.
            const blob = new Blob([buffer], {type: 'audio/wav'});
            const objectURL = URL.createObjectURL(blob);
            ui.setURL(objectURL);
            const save = document.createElement('a');
            save.href = objectURL;
            save.download = name;
            save.textContent = 'Save WAV';
            save.style.cssText = 'display:inline-block;background:#a9c7ff;color:#111;padding:12px 20px;border-radius:8px;font-weight:bold;text-decoration:none';
            // A direct tap keeps the download inside a user gesture on Android.
            ui.box.insertBefore(save, ui.close);
            ui.title.textContent = 'WAV ready';
            ui.status.textContent = name;
        } catch (error) {
            ui.title.textContent = 'WAV download failed';
            ui.status.textContent = error.name === 'AbortError' ? 'The request was cancelled or timed out. Reload Syncro and try again.' : error.message;
        } finally {
            clearTimeout(timeout);
            busy = false;
        }
    }

    // Capture at window level before Syncro's normal click handlers.
    window.addEventListener('click', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        const link = event.composedPath().find(element =>
            element instanceof HTMLAnchorElement && element.hasAttribute('href')
        );
        if (!link || bypass.has(link)) return;
        try { attachmentURL(link.href); } catch (_) { return; }
        event.preventDefault();
        event.stopImmediatePropagation();
        void prepare(link.href, link);
    }, true);

    GM_registerMenuCommand('Save WAV from attachment link…', () => {
        const value = prompt('Paste the Syncro WAV attachment download link:');
        if (value && value.trim()) void prepare(value.trim(), null);
    });
})();
