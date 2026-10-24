// ==UserScript==
// @name         Syncro - PWPush Password Generator
// @namespace    https://texomans.com/
// @version      1.0.6
// @description  Generate secure PWPush links in Syncro; copy them or insert a rich-text ticket reply.
// @match        https://*.syncromsp.com/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20PWPush%20Password%20Generator.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20-%20PWPush%20Password%20Generator.js
// @run-at       document-idle
// @connect      secureshare.texomans.com
// @grant        GM_xmlhttpRequest
// @grant        GM_setClipboard
// @grant        GM_registerMenuCommand
// ==/UserScript==

/*
 * COMMUNITY SETUP (edit for your MSP):
 * 1. In Syncro, create a plain-text CUSTOMER custom field named
 *    "TNS Secure Share API Key" (or change FIELD_NAME below).
 * 2. On your MSP's own customer record, populate that field with a
 *    valid Password Pusher API token. NEVER put the token in this script.
 * 3. Update CUSTOMER_ID from your Syncro /customers/123 URL,
 *    PW_HOST (hostname only), and COMPANY_NAME below.
 * 4. Also change @connect above to your PW_HOST for API access.
 * 5. If you fork/customize, update @namespace, @updateURL, and
 *    @downloadURL to your fork to avoid overwriting local settings.
 * Requires PWPush OSS API v2 and Syncro access to the customer field.
 * This field is plaintext; limit who can view its value in Syncro.
 * If an unlock passphrase is set, give it to the recipient separately.
 */

(function () {
    'use strict';

    // MSP configuration: edit these values to use your own instance.
    const CUSTOMER_ID = 4409721;
    const FIELD_NAME = 'TNS Secure Share API Key';
    const PW_HOST = 'secureshare.texomans.com';
    const COMPANY_NAME = 'Texoma Network Solutions';
    const PW_BASE = 'https://' + PW_HOST;
    const MENU_MARKER = 'data-tns-pwpush-menu';
    const MODAL_ID = 'tns-pwpush-modal';
    const STYLE_ID = 'tns-pwpush-style';
    const DEFAULTS = Object.freeze({
        length: 24,
        days: 7,
        views: 3,
        uppercase: true,
        lowercase: true,
        digits: true,
        symbols: true,
        avoidAmbiguous: true
    });

    function cleanText(value) {
        return String(value || '').replace(/\s+/g, ' ').trim();
    }

    function onTicket() {
        return /^\/tickets\/\d+(?:\/|$)/.test(location.pathname);
    }

    function escapeHtml(value) {
        const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
        return String(value).replace(/[&<>"']/g, char => entities[char]);
    }

    function findNestedProperty(obj, target, depth = 0, seen = new WeakSet()) {
        if (!obj || typeof obj !== 'object' || depth > 12 || seen.has(obj)) return '';
        seen.add(obj);
        if (Object.prototype.hasOwnProperty.call(obj, target)) {
            const value = obj[target];
            if (typeof value === 'string') return value.trim();
            if (value && typeof value.value === 'string') return value.value.trim();
        }
        for (const item of Object.values(obj)) {
            if (!item || typeof item !== 'object') continue;
            const result = findNestedProperty(item, target, depth + 1, seen);
            if (result) return result;
        }
        return '';
    }

    function fieldFromHtmlDocument(doc) {
        // Syncro customer custom fields are rendered as:
        // <div class="col-md-6 mbm">
        //   <p class="table-entry-head-wrap">FIELD_NAME (your custom field label)</p>
        //   API_VALUE
        // </div>
        // The API value can be a TEXT NODE, not an input or a table cell.
        for (const heading of doc.querySelectorAll('p.table-entry-head-wrap')) {
            if (cleanText(heading.textContent) !== FIELD_NAME) continue;
            const block = heading.closest('div.col-md-6') || heading.parentElement;
            if (!block) continue;

            let siblingText = '';
            for (let node = heading.nextSibling; node; node = node.nextSibling) {
                if (node.nodeType === Node.ELEMENT_NODE &&
                    node.matches('p.table-entry-head-wrap')) break;
                if (node.nodeType === Node.TEXT_NODE || node.nodeType === Node.ELEMENT_NODE) {
                    if (node.nodeType === Node.ELEMENT_NODE && node.matches('script,style,button')) continue;
                    siblingText += ' ' + node.textContent;
                }
            }
            if (siblingText.trim()) return siblingText.trim();

            const input = block.querySelector('input, textarea');
            if (input) {
                const value = input.value || input.getAttribute('value');
                if (value && value.trim()) return value.trim();
            }

            const copy = block.cloneNode(true);
            copy.querySelector('p.table-entry-head-wrap')?.remove();
            copy.querySelectorAll('button,script,style').forEach(el => el.remove());
            const fallback = cleanText(copy.textContent);
            if (fallback) return fallback;
        }

        // Retain compatibility if Syncro ever moves this field into its
        // React props or a table cell, like its asset custom fields.
        const tableCell = doc.querySelector(`td[data-testid="${FIELD_NAME}"]`);
        if (tableCell && tableCell.textContent.trim()) return tableCell.textContent.trim();

        for (const node of doc.querySelectorAll('[data-react-props], [data-props]')) {
            const raw = node.getAttribute('data-react-props') || node.getAttribute('data-props') || '';
            if (!raw.includes(FIELD_NAME)) continue;
            try {
                const value = findNestedProperty(JSON.parse(raw), FIELD_NAME);
                if (value) return value;
            } catch (_) {
                // Ignore unrelated non-JSON props.
            }
        }
        return '';
    }


    // Diagnostic data is deliberately allowlisted. Never copy raw responses,
    // request bodies, Authorization headers, passwords, or passphrases.
    const SCRIPT_VERSION = '1.0.6';

    function diagnosticError(step, code, message, facts = {}) {
        const error = new Error(message);
        error.safeDiagnostic = {
            step: step,
            code: code,
            endpoint: facts.endpoint || '',
            httpStatus: Number.isInteger(facts.httpStatus) ? facts.httpStatus : null,
            contentType: facts.contentType || '',
            redirected: facts.redirected || '',
            requestId: facts.requestId || '',
            cfRay: facts.cfRay || '',
            retryAfter: facts.retryAfter || '',
            networkLayer: facts.networkLayer || '',
            validationFields: facts.validationFields || '',
            elapsedMs: Number.isFinite(facts.elapsedMs) ? Math.round(facts.elapsedMs) : null
        };
        return error;
    }

    function responseFacts(response, endpoint, startedAt, secrets = []) {
        const rawHeaders = String(response?.responseHeaders || '');
        const headers = rawHeaders.split(/\r?\n/);
        function header(name) {
            const prefix = name.toLowerCase() + ':';
            const entry = headers.find(line => line.toLowerCase().startsWith(prefix));
            return entry ? entry.slice(prefix.length).trim() : '';
        }
        const rawType = header('content-type').toLowerCase();
        const contentType = rawType.includes('json') ? 'JSON' :
            rawType.includes('html') ? 'HTML' :
            rawType.includes('text/plain') ? 'Plain text' :
            rawType ? 'Other' : 'Not provided';
        const serverHeader = header('server').toLowerCase();
        const networkLayer = serverHeader.includes('cloudflare') ? 'Cloudflare' :
            /openresty|nginx/.test(serverHeader) ? 'Nginx/OpenResty' :
            serverHeader.includes('apache') ? 'Apache' : 'Not identified';
        const requestId = header('x-request-id');
        const cfRay = header('cf-ray');
        const retryAfter = header('retry-after');
        // Do not include an identifier if a broken/malicious upstream
        // accidentally returns any portion of a secret as a trace ID.
        const sensitive = secrets.filter(value => typeof value === 'string' && value.length > 0);
        const safeIdentifier = (value, format) =>
            format.test(value) && !sensitive.some(secret => value.includes(secret) || secret.includes(value))
                ? value : '';
        let redirected = 'Unknown';
        if (typeof response?.finalUrl === 'string' && response.finalUrl) {
            try {
                const final = new URL(response.finalUrl);
                const expected = new URL(PW_BASE + endpoint);
                redirected = final.origin === expected.origin &&
                    final.pathname === expected.pathname ? 'No' : 'Yes';
            } catch (_) {
                redirected = 'Unknown';
            }
        }
        return {
            endpoint: 'POST ' + endpoint,
            httpStatus: Number.isInteger(response?.status) ? response.status : null,
            contentType: contentType,
            redirected: redirected,
            // Only fixed-format IDs are accepted. Never print arbitrary headers.
            requestId: safeIdentifier(requestId, /^[a-zA-Z0-9_-]{1,80}$/),
            cfRay: safeIdentifier(cfRay, /^[a-zA-Z0-9-]{1,80}$/),
            retryAfter: /^\d{1,5}$/.test(retryAfter) ? retryAfter : '',
            networkLayer: networkLayer,
            elapsedMs: Date.now() - startedAt
        };
    }

    function knownValidationFields(response) {
        // The Rails error body can echo submitted secrets. Inspect ONLY field names.
        const allowed = new Set([
            'length', 'count', 'kind', 'payload', 'passphrase', 'charset',
            'uppercase', 'lowercase', 'digits', 'symbols', 'min_digits',
            'min_symbols', 'expire_after_days', 'expire_after_views',
            'retrieval_step'
        ]);
        let body = response?.response;
        if (!body || typeof body !== 'object') {
            try { body = JSON.parse(response?.responseText || ''); }
            catch (_) { return ''; }
        }
        if (!body || typeof body !== 'object' || Array.isArray(body)) return '';
        return Object.keys(body).filter(key => allowed.has(key)).slice(0, 8).join(', ');
    }

    function httpFailure(step, path, response, facts) {
        const status = facts.httpStatus;
        let explanation;
        switch (status) {
            case 400:
            case 422:
                explanation = 'PWPush rejected the request settings. Check password rules, expiration limits, and server policy.';
                break;
            case 401:
                explanation = 'Authentication was rejected by PWPush or a security layer. The key may be invalid, or the cross-site request may be treated differently from a direct test.';
                break;
            case 403:
                explanation = 'Access was forbidden. Check PWPush permissions and reverse-proxy, Authentik, or other security rules.';
                break;
            case 404:
                explanation = 'The PWPush API endpoint was not found. Check the server version and proxy routing.';
                break;
            case 405:
                explanation = 'The POST method was not allowed. Check reverse-proxy routing and access restrictions.';
                break;
            case 408:
                explanation = 'The server timed out handling the request.';
                break;
            case 413:
                explanation = 'The server rejected the request size. Check proxy body-size limits.';
                break;
            case 415:
                explanation = 'The server rejected the request format or Content-Type.';
                break;
            case 429:
                explanation = 'Rate limit reached. Wait before trying again.';
                if (facts.retryAfter) explanation += ' Suggested wait: ' + facts.retryAfter + ' seconds.';
                break;
            case 500:
                explanation = 'PWPush or an upstream service reported an internal error. Check container logs.';
                break;
            case 502:
            case 503:
            case 504:
                explanation = 'The service or upstream may be unavailable. Check PWPush and Nginx Proxy Manager health/logs.';
                break;
            default:
                explanation = status >= 500
                    ? 'A server or proxy error occurred. Check PWPush and proxy logs.'
                    : 'The request was refused. Check PWPush and proxy logs for the corresponding time.';
        }
        if ((status === 401 || status === 403) && facts.contentType === 'HTML') {
            explanation += ' An HTML response suggests the proxy or sign-in layer may be involved.';
        }
        const details = { ...facts };
        if (status === 400 || status === 422) {
            details.validationFields = knownValidationFields(response);
        }
        return diagnosticError(step, 'HTTP_' + (status ?? 'UNKNOWN'),
            step + ' failed (HTTP ' + (status ?? 'unknown') + '). ' + explanation, details);
    }

    function formatDiagnostic(error, fallbackStep) {
        const d = error?.safeDiagnostic || { step: fallbackStep, code: 'UNEXPECTED_ERROR' };
        const lines = [
            'Syncro PWPush Password Generator v' + SCRIPT_VERSION,
            'Time (UTC): ' + new Date().toISOString(),
            'Step: ' + (d.step || fallbackStep),
            'Failure code: ' + (d.code || 'UNEXPECTED_ERROR')
        ];
        if (d.endpoint) lines.push('Endpoint: ' + d.endpoint);
        if (d.httpStatus !== undefined && d.httpStatus !== null) lines.push('HTTP status: ' + d.httpStatus);
        if (d.contentType) lines.push('Response type: ' + d.contentType);
        if (d.redirected) lines.push('Redirect detected: ' + d.redirected);
        if (d.networkLayer) lines.push('Reported server: ' + d.networkLayer);
        if (d.requestId) lines.push('X-Request-ID: ' + d.requestId);
        if (d.cfRay) lines.push('CF-Ray: ' + d.cfRay);
        if (d.retryAfter) lines.push('Retry-After (seconds): ' + d.retryAfter);
        if (d.validationFields) lines.push('Validation field names: ' + d.validationFields);
        if (d.elapsedMs !== undefined && d.elapsedMs !== null) lines.push('Elapsed: ' + d.elapsedMs + ' ms');
        lines.push('Secrets, response bodies, and sharing links: omitted');
        return lines.join('\n');
    }

    async function readApiToken() {
        const path = '/customers/' + CUSTOMER_ID;
        const step = 'Read Syncro customer API key';
        let response;
        try {
            response = await fetch(path, {
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { Accept: 'text/html' }
            });
        } catch (_) {
            throw diagnosticError(step, 'SYNCRO_NETWORK',
                'Syncro customer lookup failed before receiving an HTTP response. Check the connection and your Syncro session.',
                {endpoint: 'GET /customers/{configured customer ID}'});
        }
        let correctPage = false;
        try {
            const returnedUrl = new URL(response.url);
            correctPage = returnedUrl.origin === location.origin && returnedUrl.pathname === path;
        } catch (_) {
            // Redirect or unexpected response.
        }
        if (!response.ok || !correctPage) {
            const status = Number.isInteger(response.status) ? response.status : null;
            const reason = !correctPage
                ? 'Syncro returned a different page (possibly a sign-in redirect). Sign in and verify customer access.'
                : 'Syncro refused the customer request. Check your session and permissions.';
            throw diagnosticError(step, 'SYNCRO_HTTP_OR_REDIRECT', reason, {
                endpoint: 'GET /customers/{configured customer ID}', httpStatus: status,
                redirected: correctPage ? 'No' : 'Yes'
            });
        }
        let doc;
        try {
            doc = new DOMParser().parseFromString(await response.text(), 'text/html');
        } catch (_) {
            throw diagnosticError(step, 'SYNCRO_INVALID_HTML',
                'Could not read the Syncro customer page. Retry after refreshing Syncro.',
                {endpoint: 'GET /customers/{configured customer ID}', httpStatus: response.status});
        }
        const token = fieldFromHtmlDocument(doc);
        if (!token) {
            throw diagnosticError(step, 'SYNCRO_FIELD_NOT_FOUND',
                'The configured API key field is missing or empty on the customer page. Check the field name and your access.',
                {endpoint: 'GET /customers/{configured customer ID}', httpStatus: response.status});
        }
        return token;
    }

    function pwpushPost(path, payload, token) {
        if (!['/api/v2/generate', '/api/v2/pushes'].includes(path)) {
            return Promise.reject(diagnosticError('PWPush API', 'UNSUPPORTED_ENDPOINT',
                'Unsupported PWPush API request.'));
        }
        const step = path === '/api/v2/generate' ? 'Generate password' : 'Create secure sharing link';
        const startedAt = Date.now();
        const endpoint = 'POST ' + path;
        const waitHint = path === '/api/v2/pushes'
            ? ' The server might have created a link even without returning its URL; this script will not retry automatically.'
            : '';
        const safeNetworkFacts = () => ({
            endpoint: endpoint, elapsedMs: Date.now() - startedAt
        });
        return new Promise((resolve, reject) => {
            try {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: PW_BASE + path,
                    timeout: 20000,
                    responseType: 'json',
                    headers: {
                        Authorization: 'Bearer ' + token,
                        'Content-Type': 'application/json',
                        Accept: 'application/json'
                    },
                    data: JSON.stringify(payload),
                    onload(response) {
                        const facts = responseFacts(response, path, startedAt, [token, payload?.push?.payload, payload?.push?.passphrase]);
                        if (facts.redirected === 'Yes' && facts.httpStatus >= 200 && facts.httpStatus < 300) {
                            reject(diagnosticError(step, 'UNEXPECTED_REDIRECT',
                                step + ' was redirected away from the PWPush endpoint. Check proxy authentication or routing.',
                                facts));
                            return;
                        }
                        if (!facts.httpStatus) {
                            reject(diagnosticError(step, 'NO_HTTP_RESPONSE',
                                step + ' returned no valid HTTP status. Check the browser, network, TLS, and proxy.',
                                facts));
                            return;
                        }
                        if (facts.httpStatus < 200 || facts.httpStatus >= 300) {
                            reject(httpFailure(step, path, response, facts));
                            return;
                        }
                        let result;
                        try {
                            if (response.response && typeof response.response === 'object') {
                                result = response.response;
                            } else if (typeof response.response === 'string' && response.response.trim()) {
                                result = JSON.parse(response.response);
                            } else {
                                result = JSON.parse(response.responseText || '');
                            }
                        } catch (_) {
                            // Do not expose HTML or JSON error bodies that could include secrets.
                        }
                        if (!result || typeof result !== 'object' || Array.isArray(result)) {
                            reject(diagnosticError(step, 'INVALID_API_RESPONSE',
                                step + ' returned HTTP ' + facts.httpStatus +
                                ' but no valid JSON object. A login page or proxy challenge may be intercepting the request.',
                                facts));
                            return;
                        }
                        resolve(result);
                    },
                    ontimeout() {
                        reject(diagnosticError(step, 'REQUEST_TIMEOUT',
                            step + ' timed out after 20 seconds. Check server/network availability.' + waitHint,
                            safeNetworkFacts()));
                    },
                    onerror() {
                        reject(diagnosticError(step, 'NETWORK_ERROR',
                            step + ' failed before a usable HTTP response. Check DNS, TLS, the proxy, and browser-extension permissions.' + waitHint,
                            safeNetworkFacts()));
                    },
                    onabort() {
                        reject(diagnosticError(step, 'REQUEST_ABORTED',
                            step + ' was aborted before completion.' + waitHint,
                            safeNetworkFacts()));
                    }
                });
            } catch (_) {
                reject(diagnosticError(step, 'REQUEST_SETUP_FAILED',
                    'The browser could not start the PWPush API request. Check Tampermonkey and @connect permissions.',
                    safeNetworkFacts()));
            }
        });
    }

    function getSafeShareUrl(value) {
        if (typeof value !== 'string') throw new Error('PWPush did not return a sharing link.');
        let url;
        try { url = new URL(value); } catch (_) { throw new Error('PWPush returned an invalid link.'); }
        if (url.hostname !== PW_HOST || !['https:', 'http:'].includes(url.protocol) ||
            url.username || url.password || (url.port && url.port !== '443')) {
            throw new Error('PWPush returned a link for an unexpected destination.');
        }
        url.protocol = 'https:';
        if (!/^\/p\/[^/]+\/r\/?$/.test(url.pathname)) {
            throw new Error('PWPush did not return the required retrieval-confirmation link.');
        }
        return url.toString();
    }

    // PWPush OSS 2.14 enforces at least one of every enabled class.
    // Verify its output locally BEFORE saving or sharing the password.
    function validateGeneratedPassword(password, length, rules) {
        if (typeof password !== 'string' || password.length !== length) {
            throw new Error('PWPush returned a password of the wrong length.');
        }

        const classes = [
            { enabled: rules.uppercase, name: 'uppercase letter', test: /[A-Z]/ },
            { enabled: rules.lowercase, name: 'lowercase letter', test: /[a-z]/ },
            { enabled: rules.digits, name: 'number', test: /[0-9]/ },
            { enabled: rules.symbols, name: 'special character', test: /[!@#$%^&*]/ }
        ];

        for (const item of classes) {
            if (item.enabled && !item.test.test(password)) {
                throw new Error('PWPush did not include a required ' + item.name + '. No link was created.');
            }
            if (!item.enabled && item.test.test(password)) {
                throw new Error('PWPush included an unselected ' + item.name + '. No link was created.');
            }
        }

        if (rules.avoidAmbiguous && /[Il1O0o]/.test(password)) {
            throw new Error('PWPush included an ambiguous character. No link was created.');
        }
    }

    function buildCustomerHtml(link, days, views, hasPassphrase = false) {
        return [
            '<p>A secure password has been shared with you by ' + escapeHtml(COMPANY_NAME) + '.</p>',
            '<p><span aria-hidden="true" style="font-size:16px;vertical-align:middle;">&#128274;</span>&nbsp;<strong><a href="' + escapeHtml(link) + '" target="_blank" rel="noopener noreferrer">Secure Password Link</a></strong></p>',
            '<p><small>Hosted securely at ' + escapeHtml(PW_HOST) + '</small></p>',
            ...(hasPassphrase ? [
                '<p><strong>&#128272; Unlock Passphrase Required:</strong><br>' +
                'For additional security, this link requires an unlock passphrase before the password can be viewed. ' +
                'A technician from ' + escapeHtml(COMPANY_NAME) + ' will contact you separately to provide it.</p>'
            ] : []),
            '<p style="margin:0;line-height:12px;font-size:12px;">&nbsp;</p>',
            '<p style="color:#b42318;"><strong>IMPORTANT NOTES:</strong></p>',
            '<ul style="color:#b42318;">',
            '<li>This link expires after ' + Number(days) + ' days or ' + Number(views) + ' views, whichever occurs first.</li>',
            '<li>Once expired, the password can no longer be retrieved.</li>',
            '</ul>'
        ].join('');
    }

    function findTicketEditor() {
        const forms = Array.from(document.querySelectorAll('form#new_comment'));
        const form = forms.find(item => item.querySelector('.note-editable')) || forms[0];
        return form?.querySelector('.note-editable[contenteditable="true"], .note-editable') || null;
    }

    function appendToTicket(html) {
        const editor = findTicketEditor();
        if (!editor) return false;
        const hasText = Boolean(cleanText(editor.textContent) || editor.querySelector('img,table,hr'));
        const markup = (hasText ? '<p><br></p>' : '') + html;
        editor.focus();
        const range = document.createRange();
        range.selectNodeContents(editor);
        range.collapse(false);
        const selection = window.getSelection();
        if (!selection) return false;
        selection.removeAllRanges();
        selection.addRange(range);
        let succeeded = false;
        try { succeeded = document.execCommand('insertHTML', false, markup); } catch (_) { /* fallback */ }
        if (!succeeded) {
            const fragment = range.createContextualFragment(markup);
            range.insertNode(fragment);
        }
        editor.dispatchEvent(new Event('input', { bubbles: true }));
        editor.dispatchEvent(new Event('change', { bubbles: true }));
        editor.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return true;
    }

    async function copyText(value) {
        try {
            if (typeof GM_setClipboard === 'function') {
                GM_setClipboard(value, 'text');
                return true;
            }
            await navigator.clipboard.writeText(value);
            return true;
        } catch (_) {
            return false;
        }
    }

    function installStyles() {
        if (document.getElementById(STYLE_ID)) return;
        const style = document.createElement('style');
        style.id = STYLE_ID;
        style.textContent = `
            #${MODAL_ID} { position:fixed; inset:0; z-index:2147483600; padding:12px; background:rgba(0,0,0,.68); display:flex; align-items:center; justify-content:center; }
            #${MODAL_ID}, #${MODAL_ID} * { box-sizing:border-box; }
            #${MODAL_ID} .tns-pw-card { width:min(100%,580px); max-height:calc(100vh - 24px); overflow:auto; padding:20px; background:#262b33; color:#f4f6f8; border:1px solid #454d59; border-radius:12px; box-shadow:0 16px 56px rgba(0,0,0,.65); font:14px/1.5 Arial,sans-serif; }
            #${MODAL_ID} .tns-pw-head { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:12px; }
            #${MODAL_ID} h2 { margin:0; color:white; font-size:19px; font-weight:700; }
            #${MODAL_ID} p { margin:6px 0 13px; }
            #${MODAL_ID} .tns-pw-muted { color:#bdc7d3; font-size:12px; }
            #${MODAL_ID} .tns-pw-grid { display:grid; grid-template-columns:1fr 1fr; gap:12px; margin:12px 0; }
            #${MODAL_ID} .tns-pw-field { display:flex; flex-direction:column; gap:5px; min-width:0; }
            #${MODAL_ID} .tns-pw-passphrase-wrap { position:relative; }
            #${MODAL_ID} .tns-pw-passphrase-wrap input { padding-right:40px; }
            #${MODAL_ID} .tns-pw-passphrase-wrap button { position:absolute; top:50%; right:4px; transform:translateY(-50%); background:transparent; border:0; color:#c9d5e1; padding:7px 9px; min-width:32px; }
            #${MODAL_ID} .tns-pw-passphrase-wrap button:hover:not(:disabled) { background:#3c4a58; }
            #${MODAL_ID} label { font-size:13px; color:#f1f3f7; font-weight:600; }
            #${MODAL_ID} input[type="number"], #${MODAL_ID} input[type="text"], #${MODAL_ID} input[type="password"], #${MODAL_ID} select { width:100%; background:#171b21; color:#f7f8fa; border:1px solid #66717e; padding:9px 10px; border-radius:6px; font:inherit; }
            #${MODAL_ID} .tns-pw-check { display:flex; align-items:flex-start; gap:8px; margin:9px 0; cursor:pointer; font-weight:normal; }
            #${MODAL_ID} .tns-pw-classes { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); column-gap:12px; row-gap:2px; margin:7px 0 8px; }
            #${MODAL_ID} .tns-pw-classes .tns-pw-check { margin:5px 0; }
            #${MODAL_ID} input[type="checkbox"] { margin:4px 0 0; accent-color:#4d87bd; }
            #${MODAL_ID} .tns-pw-actions { display:flex; flex-wrap:wrap; gap:8px; margin:14px 0 0; }
            #${MODAL_ID} button { border:1px solid #627083; background:#3b4551; color:white; border-radius:6px; padding:9px 13px; cursor:pointer; font:inherit; }
            #${MODAL_ID} button:hover:not(:disabled) { background:#536477; }
            #${MODAL_ID} button:disabled { opacity:.55; cursor:wait; }
            #${MODAL_ID} .tns-pw-main { background:#245f9c; border-color:#3473b1; font-weight:700; }
            #${MODAL_ID} .tns-pw-main:hover:not(:disabled) { background:#3074b8; }
            #${MODAL_ID} .tns-pw-status { min-height:20px; margin:12px 0 0; color:#a8d9b4; }
            #${MODAL_ID} .tns-pw-status.error { color:#ffafaa; }
            #${MODAL_ID} .tns-pw-diagnostics { margin-top:10px; padding:10px 12px; background:#181d25; border:1px solid #546071; border-radius:6px; }
            #${MODAL_ID} .tns-pw-diagnostics summary { font-weight:600; cursor:pointer; color:#d1e2f5; }
            #${MODAL_ID} .tns-pw-diagnostics pre { margin:10px 0; white-space:pre-wrap; overflow-wrap:anywhere; color:#e2e6eb; background:#11171e; border-radius:5px; padding:10px; font:12px/1.5 monospace; }
            #${MODAL_ID} .tns-pw-diagnostics .tns-pw-muted { margin:8px 0 0; }
            #${MODAL_ID} .tns-pw-result { display:none; margin-top:12px; padding-top:13px; border-top:1px solid #49515a; }
            #${MODAL_ID} .tns-pw-result.show { display:block; }
            #${MODAL_ID} .tns-pw-preview { margin-top:11px; padding:12px; background:white; color:#262626; border-radius:6px; overflow-wrap:anywhere; font:14px/1.55 Arial,sans-serif; }
            #${MODAL_ID} .tns-pw-preview a { color:#1565a9; }
            #${MODAL_ID} .tns-pw-preview p { margin:4px 0 10px; }
            #${MODAL_ID} .tns-pw-preview ul { padding-left:22px; margin:4px 0 0; }
            #${MODAL_ID} .tns-pw-preview li { margin:3px 0; }
            @media(max-width:480px) { #${MODAL_ID} .tns-pw-card { padding:13px; } }
        `;
        document.head.appendChild(style);
    }

    function showDialog(mode) {
        document.getElementById(MODAL_ID)?.remove();
        installStyles();
        const ticketMode = mode === 'ticket' && onTicket();
        const overlay = document.createElement('div');
        overlay.id = MODAL_ID;
        overlay.innerHTML = `
            <div class="tns-pw-card" role="dialog" aria-modal="true" aria-label="Secure Password Generator">
                <div class="tns-pw-head"><h2>Secure Password Generator</h2><button type="button" data-action="close" aria-label="Close">&times;</button></div>
                <p class="tns-pw-muted">PWPush Open Source - ${PW_HOST}<br>Copy the secure link${ticketMode ? ' and prepare a ticket update' : ''}. Never put the password itself in a ticket.</p>
                <div class="tns-pw-grid">
                    <div class="tns-pw-field"><label for="tns-pw-length">Password length</label><input id="tns-pw-length" type="number" min="12" max="64" value="${DEFAULTS.length}"></div>
                    <div class="tns-pw-field"><label for="tns-pw-days">Expires after</label><select id="tns-pw-days"><option value="1">1 day</option><option value="3">3 days</option><option value="7" selected>7 days</option><option value="14">14 days</option><option value="30">30 days</option></select></div>
                    <div class="tns-pw-field"><label for="tns-pw-views">Maximum views</label><select id="tns-pw-views"><option value="1">1 view</option><option value="3" selected>3 views</option><option value="5">5 views</option><option value="10">10 views</option></select></div>
                    <div class="tns-pw-field">
                        <label for="tns-pw-passphrase">Unlock passphrase (optional)</label>
                        <div class="tns-pw-passphrase-wrap">
                            <input id="tns-pw-passphrase" type="password" placeholder="Leave blank for none" maxlength="256" autocomplete="off" spellcheck="false">
                            <button type="button" data-action="toggle-passphrase" aria-label="Show unlock passphrase" aria-pressed="false" title="Show / hide unlock passphrase">
                                <i class="fas fa-eye" aria-hidden="true"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <p class="tns-pw-muted">Optional unlock passphrases must be provided to the recipient separately from this link.</p>
                <div class="tns-pw-field">
                    <label>Password character types (at least one of each checked type)</label>
                    <div class="tns-pw-classes">
                        <label class="tns-pw-check"><input id="tns-pw-uppercase" type="checkbox" ${DEFAULTS.uppercase ? 'checked' : ''}> Uppercase (A-Z)</label>
                        <label class="tns-pw-check"><input id="tns-pw-lowercase" type="checkbox" ${DEFAULTS.lowercase ? 'checked' : ''}> Lowercase (a-z)</label>
                        <label class="tns-pw-check"><input id="tns-pw-digits" type="checkbox" ${DEFAULTS.digits ? 'checked' : ''}> Numbers (0-9)</label>
                        <label class="tns-pw-check"><input id="tns-pw-symbols" type="checkbox" ${DEFAULTS.symbols ? 'checked' : ''}> Symbols (!@#$%^&amp;*)</label>
                    </div>
                </div>
                <label class="tns-pw-check"><input id="tns-pw-ambiguous" type="checkbox" ${DEFAULTS.avoidAmbiguous ? 'checked' : ''}> Avoid confusing characters (0/O, 1/l, etc.)</label>
                ${ticketMode ? '<label class="tns-pw-check"><input id="tns-pw-insert" type="checkbox" checked> Insert formatted message into the current ticket update</label>' : ''}
                <p class="tns-pw-muted">The ticket is never submitted automatically. Existing text and the Public/Private selection are preserved.</p>
                <div class="tns-pw-actions"><button type="button" class="tns-pw-main" data-action="generate">Generate &amp; Share</button></div>
                <div class="tns-pw-status" aria-live="polite"></div>
                <details class="tns-pw-diagnostics" hidden>
                    <summary>Safe troubleshooting details</summary>
                    <pre class="tns-pw-diagnostic-text"></pre>
                    <button type="button" data-action="copy-diagnostics">Copy Diagnostics</button>
                    <p class="tns-pw-muted">Only safe metadata is included: never an API key, password, unlock passphrase, or secret link.</p>
                </details>
                <section class="tns-pw-result" aria-label="Generated result">
                    <div class="tns-pw-field"><label for="tns-pw-password">Generated password</label><input id="tns-pw-password" type="password" readonly autocomplete="off"></div>
                    <div class="tns-pw-actions"><button type="button" data-action="toggle">Show / Hide Password</button><button type="button" data-action="copy-password">Copy Password</button></div>
                    <div class="tns-pw-field" style="margin-top:12px;"><label for="tns-pw-url">Secure sharing link</label><input id="tns-pw-url" type="text" readonly></div>
                    <div class="tns-pw-actions"><button type="button" data-action="copy-link">Copy Link</button>${ticketMode ? '<button type="button" data-action="insert">Insert into Ticket</button>' : ''}<button type="button" data-action="again">Generate Another</button></div>
                    <div class="tns-pw-muted" style="margin-top:10px;">Customer-facing message:</div><div class="tns-pw-preview"></div>
                </section>
            </div>
        `;
        document.body.appendChild(overlay);
        const $ = selector => overlay.querySelector(selector);
        const status = $('.tns-pw-status');
        const generate = $('[data-action="generate"]');
        const result = $('.tns-pw-result');
        const state = { password: '', link: '', days: DEFAULTS.days, views: DEFAULTS.views, hasPassphrase: false, busy: false, inserted: false, diagnosticText: '' };

        function setStatus(text, error = false) {
            status.textContent = text;
            status.classList.toggle('error', error);
        }
        function clearDiagnostic() {
            state.diagnosticText = '';
            const details = $('.tns-pw-diagnostics');
            details.hidden = true;
            details.open = false;
            $('.tns-pw-diagnostic-text').textContent = '';
            $('[data-action="copy-diagnostics"]').textContent = 'Copy Diagnostics';
        }
        function showError(error, currentStep) {
            // Only known, constant script messages and our allowlisted
            // diagnostic errors may be shown. Never echo raw server bodies.
            const rawMessage = error instanceof Error ? error.message : '';
            const knownScriptMessage = /^PWPush (returned|did not|included)|^The secure sharing link is invalid/.test(rawMessage);
            const message = error?.safeDiagnostic
                ? error.message
                : knownScriptMessage
                    ? rawMessage
                    : 'An unexpected error occurred while processing the request. See safe troubleshooting details.';
            setStatus(message, true);
            const safeError = error?.safeDiagnostic ? error :
                diagnosticError(currentStep, 'UNEXPECTED_SCRIPT_ERROR', message);
            state.diagnosticText = formatDiagnostic(safeError, currentStep);
            $('.tns-pw-diagnostic-text').textContent = state.diagnosticText;
            const details = $('.tns-pw-diagnostics');
            details.hidden = false;
            details.open = true;
        }
        function close() {
            if (state.busy) return;
            document.removeEventListener('keydown', keyHandler);
            state.password = '';
            state.link = '';
            $('#tns-pw-passphrase').value = '';
            overlay.remove();
        }
        function keyHandler(event) { if (event.key === 'Escape') close(); }
        document.addEventListener('keydown', keyHandler);
        overlay.addEventListener('click', event => { if (event.target === overlay) close(); });
        $('[data-action="close"]').addEventListener('click', close);
        $('[data-action="copy-diagnostics"]').addEventListener('click', async () => {
            if (!state.diagnosticText) return;
            const copied = await copyText(state.diagnosticText);
            $('[data-action="copy-diagnostics"]').textContent = copied
                ? 'Diagnostics Copied' : 'Copy failed - select and copy the text';
        });
        $('[data-action="toggle-passphrase"]').addEventListener('click', () => {
            const input = $('#tns-pw-passphrase');
            const button = $('[data-action="toggle-passphrase"]');
            const showing = input.type === 'password';
            input.type = showing ? 'text' : 'password';
            button.setAttribute('aria-label', showing ? 'Hide unlock passphrase' : 'Show unlock passphrase');
            button.setAttribute('aria-pressed', String(showing));
            button.querySelector('i').className = showing ? 'fas fa-eye-slash' : 'fas fa-eye';
        });

        generate.addEventListener('click', async () => {
            if (state.busy) return;
            const length = Number($('#tns-pw-length').value);
            const days = Number($('#tns-pw-days').value);
            const views = Number($('#tns-pw-views').value);
            const unlockPassphrase = $('#tns-pw-passphrase').value.trim();
            $('#tns-pw-passphrase').value = unlockPassphrase;
            const rules = {
                uppercase: $('#tns-pw-uppercase').checked,
                lowercase: $('#tns-pw-lowercase').checked,
                digits: $('#tns-pw-digits').checked,
                symbols: $('#tns-pw-symbols').checked,
                avoidAmbiguous: $('#tns-pw-ambiguous').checked
            };
            if (!Number.isInteger(length) || length < 12 || length > 64) {
                setStatus('Password length must be between 12 and 64.', true);
                return;
            }
            if (![rules.uppercase, rules.lowercase, rules.digits, rules.symbols].some(Boolean)) {
                setStatus('Select at least one character type before generating.', true);
                return;
            }
            state.busy = true;
            generate.disabled = true;
            state.inserted = false;
            clearDiagnostic();
            let currentStep = 'Read Syncro customer API key';
            setStatus('Reading API key from your Syncro customer record...');
            let token;
            try {
                token = await readApiToken();
                currentStep = 'Generate password';
                setStatus('Generating password through PWPush...');
                const generated = await pwpushPost('/api/v2/generate', {
                    type: 'password', length, count: 1,
                    charset: 'ascii',
                    uppercase: rules.uppercase,
                    lowercase: rules.lowercase,
                    digits: rules.digits,
                    symbols: rules.symbols,
                    min_digits: rules.digits ? 1 : 0,
                    min_symbols: rules.symbols ? 1 : 0,
                    avoid_ambiguous: rules.avoidAmbiguous
                }, token);
                const password = generated?.results?.[0];
                currentStep = 'Validate generated password';
                validateGeneratedPassword(password, length, rules);
                currentStep = 'Create secure sharing link';
                setStatus('Creating 7-day/3-view secure link (or your selected expiration)...');
                const pushed = await pwpushPost('/api/v2/pushes', {
                    push: {
                        kind: 'text', payload: password,
                        expire_after_days: days, expire_after_views: views,
                        retrieval_step: true, deletable_by_viewer: false,
                        ...(unlockPassphrase ? { passphrase: unlockPassphrase } : {})
                    }
                }, token);
                currentStep = 'Validate secure sharing link';
                if (pushed?.retrieval_step !== true) {
                    throw new Error('PWPush did not enable retrieval confirmation.');
                }
                // PWPush OSS v2.14 returns the passphrase in its create response.
                // Never log the passphrase or include it in the shared message.
                if (unlockPassphrase && pushed.passphrase !== unlockPassphrase) {
                    throw new Error('PWPush did not confirm the unlock passphrase. No link was shared.');
                }
                const link = getSafeShareUrl(pushed.html_url);
                state.password = password;
                state.link = link;
                state.days = days;
                state.views = views;
                state.hasPassphrase = Boolean(unlockPassphrase);
                $('#tns-pw-password').value = password;
                $('#tns-pw-url').value = link;
                $('.tns-pw-preview').innerHTML = buildCustomerHtml(link, days, views, state.hasPassphrase);
                result.classList.add('show');

                const copied = await copyText(link);
                const wantsInsert = ticketMode && $('#tns-pw-insert')?.checked;
                const inserted = wantsInsert && appendToTicket(buildCustomerHtml(link, days, views, state.hasPassphrase));
                state.inserted = Boolean(inserted);
                if (copied && inserted) setStatus('Link copied and rich-text message inserted. Review the ticket before submitting.');
                else if (inserted) setStatus('Message inserted; clipboard copy failed. Use Copy Link.');
                else if (copied && wantsInsert) setStatus('Link copied. Ticket editor not found; paste or insert manually.');
                else if (copied) setStatus('Secure sharing link copied to clipboard.' + (state.hasPassphrase ? ' Provide the unlock passphrase separately.' : ''));
                else setStatus('Link created but clipboard copy failed. Use Copy Link.', true);
            } catch (error) {
                // Never log the API token, generated password, passphrase,
                // response body, or secret URL, even in diagnostics.
                showError(error, currentStep);
                generate.disabled = false;
            } finally {
                token = null;
                state.busy = false;
            }
        });

        $('[data-action="toggle"]').addEventListener('click', () => {
            const input = $('#tns-pw-password');
            input.type = input.type === 'password' ? 'text' : 'password';
        });
        $('[data-action="copy-password"]').addEventListener('click', async () => {
            if (!state.password) return;
            const worked = await copyText(state.password);
            setStatus(worked ? 'Password copied. Paste it only where needed.' : 'Could not copy the password.', !worked);
        });
        $('[data-action="copy-link"]').addEventListener('click', async () => {
            if (!state.link) return;
            const worked = await copyText(state.link);
            setStatus(worked ? 'Secure link copied.' : 'Could not copy the link.', !worked);
        });
        $('[data-action="insert"]')?.addEventListener('click', () => {
            if (!state.link) return;
            if (state.inserted) return setStatus('The message is already inserted in this ticket.');
            if (appendToTicket(buildCustomerHtml(state.link, state.days, state.views, state.hasPassphrase))) {
                state.inserted = true;
                setStatus('Rich-text message inserted. Review before submitting.');
            } else {
                setStatus('Ticket editor not found.', true);
            }
        });
        $('[data-action="again"]').addEventListener('click', () => { close(); showDialog(mode); });
        generate.focus();
    }

    function addMenuItem(menu, mode) {
        if (!menu || menu.querySelector(`[${MENU_MARKER}="${mode}"]`)) return;
        const anchor = document.createElement('a');
        anchor.href = '#';
        anchor.className = menu.querySelector('a')?.className || '';
        anchor.setAttribute(MENU_MARKER, mode);
        anchor.setAttribute('role', 'menuitem');
        const icon = document.createElement('i');
        icon.className = 'fas fa-key';
        icon.style.marginRight = '7px';
        icon.setAttribute('aria-hidden', 'true');
        anchor.append(icon, document.createTextNode('Generate Password'));
        anchor.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            showDialog(mode);
        });
        if (menu.matches('ul, ol')) {
            const li = document.createElement('li');
            li.appendChild(anchor);
            menu.appendChild(li);
        } else {
            menu.appendChild(anchor);
        }
    }

    function dropdownFor(toggle) {
        // Ticket '+ New' is <a data-toggle="dropdown">...<i class="fa-plus">
        // followed by <ul class="dropdown-menu"> in the same dropdown group.
        let parent = toggle.parentElement;
        for (let i = 0; parent && parent !== document.body && i < 5; i++, parent = parent.parentElement) {
            const direct = parent.querySelector(':scope > .dropdown-menu, :scope > [role="menu"]');
            if (direct) return direct;
        }
        return null;
    }

    function installMenuItems() {
        // System-wide header '+': clipboard-only.
        document.querySelectorAll(
            '#user-menu-partial .add-new-dropdown-menu, ' +
            '.syncro-top-nav-container .add-new-dropdown-menu, ' +
            '#section_header .add-new-dropdown-menu'
        ).forEach(menu => addMenuItem(menu, 'global'));

        // Ticket '+ New': the '+' is an ICON, not text, so its text is 'New'.
        if (!onTicket()) return;
        document.querySelectorAll('a.dropdown-toggle[data-toggle="dropdown"], button.dropdown-toggle[data-toggle="dropdown"]').forEach(toggle => {
            if (cleanText(toggle.textContent) !== 'New') return;
            if (!toggle.querySelector('i.fa-plus, i.fas.fa-plus, i.far.fa-plus')) return;
            const menu = dropdownFor(toggle);
            if (menu) addMenuItem(menu, 'ticket');
        });
    }

    if (typeof GM_registerMenuCommand === 'function') {
        GM_registerMenuCommand('Secure Share: Generate Password', () => showDialog('global'));
    }
    let scheduled = false;
    const observer = new MutationObserver(() => {
        if (scheduled) return;
        scheduled = true;
        requestAnimationFrame(() => {
            scheduled = false;
            installMenuItems();
        });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    installMenuItems();
})();
