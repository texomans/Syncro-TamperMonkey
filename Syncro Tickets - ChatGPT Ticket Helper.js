// ==UserScript==
// @name         Syncro Tickets - ChatGPT Ticket Helper
// @namespace    https://texomans.com/
// @version      1.3.0
// @description  ChatGPT ticket helper with @Syncro live data, page fallback, linked Syncro Chat transcripts, clean new-chat workflow, and Public/Private Note preparation.
// @match        https://*.syncromsp.com/tickets/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Tickets%20-%20ChatGPT%20Ticket%20Helper.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Tickets%20-%20ChatGPT%20Ticket%20Helper.js
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_openInTab
// ==/UserScript==

(function () {
    'use strict';

    const PANEL_ID = 'tns-chatgpt-ticket-helper';
    const STORAGE_KEY = 'tns-chatgpt-ticket-helper-collapsed';
    const CHATGPT_URL = 'https://chatgpt.com/';
    const MAX_COMMENTS = 40;
    const MAX_TICKET_CONTEXT_CHARS = 60000;
    const MAX_CHAT_TRANSCRIPT_CHARS = 40000;
    const CHAT_LOAD_TIMEOUT_MS = 15000;

    const CHAT_MESSAGE_SELECTORS = [
        '[data-testid*="message"]',
        '[data-message-id]',
        '[class*="chat-message"]',
        '[class*="chat_message"]',
        '[class*="message-bubble"]',
        '[class*="messageBubble"]',
        '[class*="message-item"]',
        '[class*="messageItem"]',
        '[class*="message-row"]',
        '[class*="messageRow"]',
        '[class*="chat-line"]',
        '[class*="chatLine"]'
    ];

    const CHAT_AUTHOR_SELECTORS = [
        '[data-testid*="author"]',
        '[data-testid*="sender"]',
        '[class*="author"]',
        '[class*="sender"]',
        '[class*="message-name"]',
        '[class*="messageName"]',
        '[class*="user-name"]',
        '[class*="userName"]'
    ];

    const CHAT_TIME_SELECTORS = [
        'time',
        '[data-testid*="time"]',
        '[class*="timestamp"]',
        '[class*="time-stamp"]',
        '[class*="message-time"]',
        '[class*="messageTime"]'
    ];

    let linkedChatCache = {
        url: '',
        state: 'idle',
        result: null,
        error: '',
        promise: null
    };

    // ------------------------------------------------------------
    // General helpers
    // ------------------------------------------------------------

    function cleanText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

    function elementText(element) {
        return element
            ? cleanText(element.innerText || element.textContent || '')
            : '';
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function isVisible(element) {
        if (!element) return false;

        const style = window.getComputedStyle(element);

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Boolean(
                element.offsetWidth ||
                element.offsetHeight ||
                element.getClientRects().length
            )
        );
    }

    function isVisibleInDocument(element) {
        if (
            !element ||
            element.nodeType !== 1
        ) {
            return false;
        }

        const view =
            element.ownerDocument?.defaultView;

        if (!view) {
            return false;
        }

        const style =
            view.getComputedStyle(element);

        const rect =
            element.getBoundingClientRect();

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            Number(style.opacity || '1') !== 0 &&
            rect.width > 0 &&
            rect.height > 0
        );
    }

    function setStatus(
        message,
        error = false
    ) {
        const status =
            document.getElementById(
                'tns-gpt-status'
            );

        if (!status) {
            return;
        }

        status.textContent =
            message;

        status.classList.toggle(
            'error',
            error
        );

        status.classList.add(
            'show'
        );

        clearTimeout(
            setStatus.timeout
        );

        setStatus.timeout =
            setTimeout(
                () => {
                    status.classList.remove(
                        'show',
                        'error'
                    );
                },
                7000
            );
    }

    // ------------------------------------------------------------
    // Ticket information
    // ------------------------------------------------------------

    function getTableValue(label) {
        const target =
            label.toLowerCase();

        const heading = [
            ...document.querySelectorAll('th')
        ].find(
            th =>
                cleanText(
                    th.textContent
                ).toLowerCase() === target
        );

        const cell =
            heading
                ?.closest('tr')
                ?.querySelector('td');

        if (!cell) {
            return '';
        }

        const select =
            cell.querySelector('select');

        if (
            select &&
            select.selectedIndex >= 0
        ) {
            return cleanText(
                select.options[
                    select.selectedIndex
                ]?.textContent
            );
        }

        return elementText(cell);
    }

    function getTicketNumber() {
        /*
         * Current Syncro ticket pages expose the actual user-facing
         * ticket number here. This is more reliable than the URL,
         * because the URL contains Syncro's internal ticket ID.
         */
        try {
            const raw =
                document.querySelector(
                    '#appointments-links-ticket-comments'
                )?.dataset?.props;

            if (raw) {
                const props =
                    JSON.parse(raw);

                if (props.ticketNumber) {
                    return String(
                        props.ticketNumber
                    );
                }
            }

        } catch (error) {
            console.debug(
                '[TNS ChatGPT Helper] Could not parse ticket data-props.',
                error
            );
        }

        const headingText =
            elementText(
                document.querySelector(
                    '.rs2-ticket-main h1'
                )
            );

        const headingMatch =
            headingText.match(
                /#?(\d+)/
            );

        if (headingMatch) {
            return headingMatch[1];
        }

        const titleMatch =
            document.title.match(
                /Ticket\s+#?(\d+)/i
            );

        return (
            titleMatch?.[1] ||
            ''
        );
    }

    function getTicketSubject() {
        return elementText(
            document.querySelector(
                '.ticket-subject-title'
            )
        );
    }

    // ------------------------------------------------------------
    // Ticket communications
    // ------------------------------------------------------------

    function getCommentBody(element) {
        if (!element) {
            return '';
        }

        const clone =
            element.cloneNode(true);

        clone
            .querySelectorAll(
                'script, style, noscript, button, .hover-actions'
            )
            .forEach(
                element =>
                    element.remove()
            );

        clone
            .querySelectorAll('br')
            .forEach(
                br => {
                    br.replaceWith(
                        document.createTextNode(
                            '\n'
                        )
                    );
                }
            );

        clone
            .querySelectorAll(
                'p, li'
            )
            .forEach(
                element => {
                    element.appendChild(
                        document.createTextNode(
                            '\n'
                        )
                    );
                }
            );

        return cleanText(
            clone.textContent
        );
    }

    function getComments(
        includePrivate
    ) {
        const nodes = [
            ...document.querySelectorAll(
                '.comment-list > [id^="comment-"]'
            )
        ];

        return nodes
            .map(
                node => {
                    const isPrivate =
                        node.matches(
                            '[data-testid="private-comment"]'
                        ) ||
                        node.classList.contains(
                            'private'
                        );

                    if (
                        isPrivate &&
                        !includePrivate
                    ) {
                        return null;
                    }

                    const authorElement =
                        node.querySelector(
                            '.author-label'
                        );

                    const author =
                        authorElement
                            ?.getAttribute(
                                'title'
                            ) ||
                        elementText(
                            authorElement
                        ) ||
                        'Unknown';

                    const subject =
                        elementText(
                            node.querySelector(
                                '.small-table-header'
                            )
                        ) ||
                        'Update';

                    const dateElement =
                        node.querySelector(
                            '.meta .mrm'
                        );

                    const date =
                        dateElement
                            ?.getAttribute(
                                'title'
                            ) ||
                        elementText(
                            dateElement
                        );

                    const body =
                        getCommentBody(
                            node.querySelector(
                                '[id^="comment-body-"]'
                            )
                        );

                    return body
                        ? {
                            private:
                                isPrivate,
                            author,
                            subject,
                            date,
                            body
                        }
                        : null;
                }
            )
            .filter(Boolean)
            .slice(
                0,
                MAX_COMMENTS
            )
            .reverse();
    }

    // ------------------------------------------------------------
    // Linked Syncro Chat detection
    // ------------------------------------------------------------

    function getLinkedChatInfo() {
        const root =
            document.querySelector(
                '.comment-list'
            ) ||
            document;

        /*
         * Preferred method:
         * look for an actual /chat/<id> link in ticket communications.
         */
        for (
            const anchor
            of root.querySelectorAll(
                'a[href*="/chat/"]'
            )
        ) {
            const href =
                anchor.getAttribute(
                    'href'
                ) ||
                '';

            const match =
                href.match(
                    /\/chat\/(\d+)(?:[/?#]|$)/i
                );

            if (match) {
                const id =
                    match[1];

                return {
                    id,
                    url:
                        new URL(
                            `/chat/${id}`,
                            window.location.origin
                        ).href
                };
            }
        }

        /*
         * Fallback:
         * Syncro may render the System note as plain text.
         */
        const text =
            cleanText(
                root.textContent ||
                ''
            );

        const match =
            text.match(
                /(?:https?:\/\/[^\s<>'"]+)?\/chat\/(\d+)(?:[/?#]|$)/i
            );

        if (!match) {
            return null;
        }

        const id =
            match[1];

        return {
            id,
            url:
                new URL(
                    `/chat/${id}`,
                    window.location.origin
                ).href
        };
    }

    // ------------------------------------------------------------
    // Linked Chat transcript extraction
    //
    // This intentionally follows the same general strategy as the
    // separate "Syncro Chat - Ticket Note Helper" userscript.
    // ------------------------------------------------------------

    function chatText(element) {
        return element
            ? cleanText(
                element.innerText ||
                element.textContent ||
                ''
            )
            : '';
    }

    function ancestorChain(
        element,
        doc
    ) {
        const chain = [];

        let node =
            element;

        while (
            node &&
            node.nodeType === 1
        ) {
            chain.push(node);

            if (
                node ===
                doc.body
            ) {
                break;
            }

            node =
                node.parentElement;
        }

        return chain;
    }

    function commonAncestor(
        a,
        b,
        doc
    ) {
        if (!a || !b) {
            return null;
        }

        const bSet =
            new Set(
                ancestorChain(
                    b,
                    doc
                )
            );

        return ancestorChain(
            a,
            doc
        ).find(
            node =>
                bSet.has(node)
        ) || null;
    }

    function findChatReference(doc) {
        return [
            ...doc.querySelectorAll(
                'a, button'
            )
        ].find(
            element => {
                if (
                    !isVisibleInDocument(
                        element
                    )
                ) {
                    return false;
                }

                const text =
                    chatText(
                        element
                    )
                        .replace(
                            /\s+/g,
                            ' '
                        )
                        .trim();

                return /^(create ticket|view ticket|ticket\s*#?\d+)$/i
                    .test(text);
            }
        ) || null;
    }

    function findChatComposer(
        doc,
        referenceElement
    ) {
        const candidates = [
            ...doc.querySelectorAll(
                'textarea, [contenteditable="true"], input[type="text"]'
            )
        ].filter(
            element => {
                if (
                    !isVisibleInDocument(
                        element
                    )
                ) {
                    return false;
                }

                const label =
                    cleanText(
                        element.getAttribute(
                            'placeholder'
                        ) ||
                        element.getAttribute(
                            'aria-label'
                        ) ||
                        ''
                    );

                const rect =
                    element.getBoundingClientRect();

                return (
                    /message|chat|reply|type|send/i
                        .test(label) ||
                    rect.width >= 200
                );
            }
        );

        if (!candidates.length) {
            return null;
        }

        if (!referenceElement) {
            return candidates.sort(
                (a, b) =>
                    b
                        .getBoundingClientRect()
                        .bottom -
                    a
                        .getBoundingClientRect()
                        .bottom
            )[0];
        }

        const referenceRect =
            referenceElement
                .getBoundingClientRect();

        const centerX =
            referenceRect.left +
            referenceRect.width / 2;

        const viewHeight =
            doc.defaultView
                ?.innerHeight ||
            900;

        candidates.sort(
            (a, b) => {
                const ar =
                    a.getBoundingClientRect();

                const br =
                    b.getBoundingClientRect();

                const aScore =
                    Math.abs(
                        (
                            ar.left +
                            ar.width / 2
                        ) -
                        centerX
                    ) +
                    Math.abs(
                        viewHeight -
                        ar.bottom
                    ) *
                    0.25;

                const bScore =
                    Math.abs(
                        (
                            br.left +
                            br.width / 2
                        ) -
                        centerX
                    ) +
                    Math.abs(
                        viewHeight -
                        br.bottom
                    ) *
                    0.25;

                return (
                    aScore -
                    bScore
                );
            }
        );

        return candidates[0];
    }

    function scoreChatRoot(
        element,
        referenceElement,
        composer,
        doc
    ) {
        if (
            !element ||
            element.nodeType !== 1 ||
            element ===
            doc.documentElement
        ) {
            return -Infinity;
        }

        const rect =
            element.getBoundingClientRect();

        if (
            rect.width < 280 ||
            rect.height < 180
        ) {
            return -Infinity;
        }

        let score = 0;

        if (
            referenceElement &&
            element.contains(
                referenceElement
            )
        ) {
            score += 15;
        }

        if (
            composer &&
            element.contains(
                composer
            )
        ) {
            score += 22;
        }

        let messageCount = 0;

        CHAT_MESSAGE_SELECTORS
            .forEach(
                selector => {
                    messageCount +=
                        element
                            .querySelectorAll(
                                selector
                            )
                            .length;
                }
            );

        score +=
            Math.min(
                messageCount,
                30
            ) *
            3;

        if (
            element ===
            doc.body
        ) {
            score -= 20;
        }

        score -=
            (
                rect.width *
                rect.height
            ) /
            300000;

        return score;
    }

    function findChatRoot(doc) {
        const reference =
            findChatReference(doc);

        const composer =
            findChatComposer(
                doc,
                reference
            );

        const common =
            commonAncestor(
                reference,
                composer,
                doc
            );

        const candidates =
            new Set();

        [
            common,
            reference,
            composer
        ]
            .filter(Boolean)
            .forEach(
                element => {
                    ancestorChain(
                        element,
                        doc
                    )
                        .slice(
                            0,
                            8
                        )
                        .forEach(
                            node =>
                                candidates.add(
                                    node
                                )
                        );
                }
            );

        [
            ...doc.querySelectorAll(
                CHAT_MESSAGE_SELECTORS
                    .join(',')
            )
        ]
            .slice(
                0,
                30
            )
            .forEach(
                message => {
                    ancestorChain(
                        message,
                        doc
                    )
                        .slice(
                            0,
                            6
                        )
                        .forEach(
                            node =>
                                candidates.add(
                                    node
                                )
                        );
                }
            );

        const ranked = [
            ...candidates
        ]
            .map(
                element => ({
                    element,
                    score:
                        scoreChatRoot(
                            element,
                            reference,
                            composer,
                            doc
                        )
                })
            )
            .filter(
                item =>
                    Number.isFinite(
                        item.score
                    )
            )
            .sort(
                (a, b) =>
                    b.score -
                    a.score
            );

        return (
            ranked[0]?.element ||
            common ||
            composer?.parentElement ||
            doc.body
        );
    }

    function chatNodeLooksLikeControl(
        element
    ) {
        if (!element) {
            return true;
        }

        if (
            element.matches(
                'button, input, textarea, select, form, nav'
            )
        ) {
            return true;
        }

        const text =
            chatText(element);

        if (!text) {
            return true;
        }

        return /^(create ticket|view ticket|details|assign to me|re-assign|close empty chat|send)$/i
            .test(text);
    }

    function getChatMessageCandidates(
        root
    ) {
        const found = [];
        const seen =
            new Set();

        CHAT_MESSAGE_SELECTORS
            .forEach(
                selector => {
                    root
                        .querySelectorAll(
                            selector
                        )
                        .forEach(
                            element => {
                                if (
                                    seen.has(
                                        element
                                    )
                                ) {
                                    return;
                                }

                                seen.add(
                                    element
                                );

                                if (
                                    !isVisibleInDocument(
                                        element
                                    ) ||
                                    chatNodeLooksLikeControl(
                                        element
                                    )
                                ) {
                                    return;
                                }

                                const text =
                                    chatText(
                                        element
                                    );

                                if (
                                    !text ||
                                    text.length > 12000
                                ) {
                                    return;
                                }

                                found.push(
                                    element
                                );
                            }
                        );
                }
            );

        const leafMost =
            found.filter(
                element => {
                    return !found.some(
                        other => {
                            if (
                                other === element ||
                                !element.contains(
                                    other
                                )
                            ) {
                                return false;
                            }

                            const outerText =
                                chatText(
                                    element
                                );

                            const innerText =
                                chatText(
                                    other
                                );

                            return (
                                innerText.length >=
                                Math.max(
                                    8,
                                    outerText.length *
                                    0.55
                                )
                            );
                        }
                    );
                }
            );

        return leafMost.sort(
            (a, b) => {
                const pos =
                    a.compareDocumentPosition(
                        b
                    );

                const NodeCtor =
                    a.ownerDocument
                        ?.defaultView
                        ?.Node;

                if (!NodeCtor) {
                    return 0;
                }

                if (
                    pos &
                    NodeCtor
                        .DOCUMENT_POSITION_FOLLOWING
                ) {
                    return -1;
                }

                if (
                    pos &
                    NodeCtor
                        .DOCUMENT_POSITION_PRECEDING
                ) {
                    return 1;
                }

                return 0;
            }
        );
    }

    function firstChatText(
        messageElement,
        selectors
    ) {
        for (
            const selector
            of selectors
        ) {
            const text =
                chatText(
                    messageElement
                        .querySelector(
                            selector
                        )
                );

            if (text) {
                return text;
            }
        }

        return '';
    }

    function getChatMessageBody(
        messageElement,
        author,
        time
    ) {
        const clone =
            messageElement
                .cloneNode(true);

        clone
            .querySelectorAll(
                'script, style, noscript, button, input, textarea, select, form, svg, [role="button"]'
            )
            .forEach(
                element =>
                    element.remove()
            );

        clone
            .querySelectorAll(
                CHAT_AUTHOR_SELECTORS
                    .join(',')
            )
            .forEach(
                element =>
                    element.remove()
            );

        clone
            .querySelectorAll(
                CHAT_TIME_SELECTORS
                    .join(',')
            )
            .forEach(
                element =>
                    element.remove()
            );

        clone
            .querySelectorAll('br')
            .forEach(
                br => {
                    br.replaceWith(
                        clone.ownerDocument
                            .createTextNode(
                                '\n'
                            )
                    );
                }
            );

        let body =
            chatText(clone);

        if (
            author &&
            body.startsWith(author)
        ) {
            body =
                cleanText(
                    body.slice(
                        author.length
                    )
                );
        }

        if (
            time &&
            body.startsWith(time)
        ) {
            body =
                cleanText(
                    body.slice(
                        time.length
                    )
                );
        }

        return body;
    }

    function extractChatTranscript(doc) {
        const root =
            findChatRoot(doc);

        const candidates =
            getChatMessageCandidates(
                root
            );

        const messages =
            candidates
                .map(
                    (
                        element,
                        index
                    ) => {
                        const author =
                            firstChatText(
                                element,
                                CHAT_AUTHOR_SELECTORS
                            );

                        const time =
                            firstChatText(
                                element,
                                CHAT_TIME_SELECTORS
                            );

                        const body =
                            getChatMessageBody(
                                element,
                                author,
                                time
                            ) ||
                            chatText(
                                element
                            );

                        if (!body) {
                            return null;
                        }

                        const header = [
                            author,
                            time
                        ].filter(Boolean);

                        return (
                            `${index + 1}. ` +
                            `${
                                header.length
                                    ? `[${header.join(' | ')}] `
                                    : ''
                            }` +
                            `${body}`
                        );
                    }
                )
                .filter(Boolean);

        if (
            messages.length >= 2
        ) {
            return {
                mode:
                    'structured',
                messageCount:
                    messages.length,
                text:
                    messages.join(
                        '\n\n'
                    )
            };
        }

        /*
         * Last-resort fallback if Syncro changes
         * the individual message classes.
         */
        const clone =
            root.cloneNode(true);

        clone
            .querySelectorAll(
                [
                    'script',
                    'style',
                    'noscript',
                    'button',
                    'input',
                    'textarea',
                    'select',
                    'form',
                    'svg',
                    'nav',
                    '[role="button"]',
                    '[aria-hidden="true"]'
                ].join(',')
            )
            .forEach(
                element =>
                    element.remove()
            );

        clone
            .querySelectorAll('br')
            .forEach(
                br => {
                    br.replaceWith(
                        clone.ownerDocument
                            .createTextNode(
                                '\n'
                            )
                    );
                }
            );

        clone
            .querySelectorAll(
                'p, li'
            )
            .forEach(
                element => {
                    element.appendChild(
                        clone.ownerDocument
                            .createTextNode(
                                '\n'
                            )
                    );
                }
            );

        const fallbackText =
            cleanText(
                chatText(clone)
                    .split('\n')
                    .filter(
                        line =>
                            !/^(create ticket|view ticket|details|assign to me|re-assign|close empty chat|send)$/i
                                .test(
                                    cleanText(
                                        line
                                    )
                                )
                    )
                    .join('\n')
            );

        return (
            fallbackText.length >= 3
                ? {
                    mode:
                        'fallback',
                    messageCount:
                        null,
                    text:
                        fallbackText
                }
                : null
        );
    }

    async function loadLinkedChatTranscript(
        info
    ) {
        /*
         * Syncro Chat is on the same origin as the ticket page.
         * A hidden iframe lets Syncro render the chat normally,
         * including content loaded dynamically by its JavaScript.
         */
        const iframe =
            document.createElement(
                'iframe'
            );

        iframe.setAttribute(
            'aria-hidden',
            'true'
        );

        iframe.tabIndex =
            -1;

        Object.assign(
            iframe.style,
            {
                position:
                    'fixed',
                left:
                    '-10000px',
                top:
                    '0',
                width:
                    '1280px',
                height:
                    '900px',
                border:
                    '0',
                opacity:
                    '0',
                pointerEvents:
                    'none'
            }
        );

        document.body
            .appendChild(
                iframe
            );

        let bestFallback =
            null;

        try {
            iframe.src =
                info.url;

            const deadline =
                Date.now() +
                CHAT_LOAD_TIMEOUT_MS;

            while (
                Date.now() <
                deadline
            ) {
                await sleep(
                    500
                );

                let doc;

                try {
                    doc =
                        iframe.contentDocument;

                } catch (error) {
                    throw new Error(
                        'The linked chat page could not be read from this Syncro session.'
                    );
                }

                if (
                    !doc?.body
                ) {
                    continue;
                }

                const bodyText =
                    cleanText(
                        doc.body.textContent ||
                        ''
                    );

                if (
                    !bodyText ||
                    (
                        /loading/i.test(
                            bodyText
                        ) &&
                        bodyText.length < 200
                    )
                ) {
                    continue;
                }

                const result =
                    extractChatTranscript(
                        doc
                    );

                if (!result) {
                    continue;
                }

                if (
                    result.mode ===
                    'structured'
                ) {
                    return result;
                }

                if (
                    result.text.length >= 10
                ) {
                    bestFallback =
                        result;
                }
            }

            if (bestFallback) {
                return bestFallback;
            }

            throw new Error(
                'Timed out waiting for the linked Syncro Chat transcript.'
            );

        } finally {
            iframe.remove();
        }
    }

    function resetLinkedChatCache(info) {
        if (
            !info ||
            linkedChatCache.url ===
            info.url
        ) {
            return;
        }

        linkedChatCache = {
            url:
                info.url,
            state:
                'idle',
            result:
                null,
            error:
                '',
            promise:
                null
        };
    }

    async function ensureLinkedChatTranscript() {
        const info =
            getLinkedChatInfo();

        if (!info) {
            return null;
        }

        resetLinkedChatCache(
            info
        );

        if (
            linkedChatCache.state ===
            'loaded' &&
            linkedChatCache.result
        ) {
            return {
                info,
                result:
                    linkedChatCache.result
            };
        }

        if (
            linkedChatCache.state ===
            'loading' &&
            linkedChatCache.promise
        ) {
            return linkedChatCache
                .promise;
        }

        linkedChatCache.state =
            'loading';

        linkedChatCache.error =
            '';

        updateLinkedChatUI();

        linkedChatCache.promise =
            loadLinkedChatTranscript(
                info
            )
                .then(
                    result => {
                        if (
                            result.text.length >
                            MAX_CHAT_TRANSCRIPT_CHARS
                        ) {
                            result.text =
                                result.text.slice(
                                    0,
                                    MAX_CHAT_TRANSCRIPT_CHARS
                                ) +
                                `\n\n[Linked chat transcript truncated at ${MAX_CHAT_TRANSCRIPT_CHARS.toLocaleString()} characters]`;
                        }

                        linkedChatCache.state =
                            'loaded';

                        linkedChatCache.result =
                            result;

                        linkedChatCache.error =
                            '';

                        updateLinkedChatUI();

                        return {
                            info,
                            result
                        };
                    }
                )
                .catch(
                    error => {
                        linkedChatCache.state =
                            'error';

                        linkedChatCache.result =
                            null;

                        linkedChatCache.error =
                            error?.message ||
                            String(error);

                        updateLinkedChatUI();

                        throw error;
                    }
                );

        return linkedChatCache
            .promise;
    }

    function updateLinkedChatUI() {
        const option =
            document.getElementById(
                'tns-gpt-linked-chat-option'
            );

        const checkbox =
            document.getElementById(
                'tns-gpt-include-linked-chat'
            );

        const status =
            document.getElementById(
                'tns-gpt-linked-chat-status'
            );

        if (
            !option ||
            !checkbox ||
            !status
        ) {
            return;
        }

        const info =
            getLinkedChatInfo();

        if (!info) {
            option.style.display =
                'none';

            checkbox.disabled =
                true;

            return;
        }

        resetLinkedChatCache(
            info
        );

        option.style.display =
            'flex';

        checkbox.disabled =
            false;

        if (
            linkedChatCache.state ===
            'loading'
        ) {
            status.textContent =
                `Linked chat #${info.id} detected — loading transcript…`;

        } else if (
            linkedChatCache.state ===
            'loaded'
        ) {
            const count =
                linkedChatCache
                    .result
                    ?.messageCount;

            status.textContent =
                count
                    ? `Linked chat #${info.id} loaded — ${count} messages detected.`
                    : `Linked chat #${info.id} loaded using fallback extraction.`;

        } else if (
            linkedChatCache.state ===
            'error'
        ) {
            status.textContent =
                `Linked chat #${info.id} detected, but automatic transcript loading failed.`;

        } else {
            status.textContent =
                `Linked chat #${info.id} detected.`;
        }
    }

    async function buildLinkedChatContext() {
        const info =
            getLinkedChatInfo();

        if (!info) {
            return '';
        }

        let output =
            'LINKED SYNCRO CHAT\n' +
            '==================\n\n';

        output +=
            `Chat ID: #${info.id}\n`;

        output +=
            `URL: ${info.url}\n`;

        try {
            const loaded =
                await ensureLinkedChatTranscript();

            if (
                !loaded?.result
            ) {
                throw new Error(
                    'No transcript was returned.'
                );
            }

            if (
                loaded.result
                    .messageCount
            ) {
                output +=
                    `Messages detected: ${loaded.result.messageCount}\n`;
            }

            output +=
                `Extraction: ${loaded.result.mode}\n\n`;

            output +=
                loaded.result.text;

        } catch (error) {
            output +=
                '\nTranscript unavailable automatically.\n';

            output +=
                `Reason: ${error?.message || String(error)}\n`;

            output +=
                'Open the linked chat manually if its conversation details are needed.\n';
        }

        return output;
    }

    // ------------------------------------------------------------
    // Browser-captured ticket context
    // ------------------------------------------------------------

    function buildTicketContext() {
        const includeComments =
            document.getElementById(
                'tns-gpt-include-comments'
            )?.checked ?? true;

        const includePrivate =
            document.getElementById(
                'tns-gpt-include-private'
            )?.checked ?? true;

        const ticketNumber =
            getTicketNumber();

        const fields = [
            [
                'Ticket',
                ticketNumber
                    ? `#${ticketNumber}`
                    : ''
            ],
            [
                'Subject',
                getTicketSubject()
            ],
            [
                'Status',
                getTableValue(
                    'Status'
                )
            ],
            [
                'Priority',
                getTableValue(
                    'Priority'
                )
            ],
            [
                'Assignee',
                getTableValue(
                    'Assignee'
                )
            ],
            [
                'Type',
                getTableValue(
                    'Type'
                )
            ],
            [
                'Tags',
                getTableValue(
                    'Tags'
                )
            ],
            [
                'SLA',
                getTableValue(
                    'SLA'
                )
            ],
            [
                'Due Date',
                getTableValue(
                    'Due Date'
                )
            ],
            [
                'Customer',
                getTableValue(
                    'Customer'
                )
            ],
            [
                'Assigned Contact',
                getTableValue(
                    'Assigned Contact'
                )
            ],
            [
                'Email',
                getTableValue(
                    'Email'
                )
            ]
        ].filter(
            ([, value]) =>
                value
        );

        let output =
            'SYNCRO PAGE SNAPSHOT\n' +
            '====================\n\n';

        fields.forEach(
            ([name, value]) => {
                output +=
                    `${name}: ${value}\n`;
            }
        );

        output +=
            `URL: ${window.location.href}\n`;

        if (includeComments) {
            const comments =
                getComments(
                    includePrivate
                );

            output +=
                '\nCOMMUNICATIONS\n' +
                '==============\n';

            if (!comments.length) {
                output +=
                    '\nNo ticket communications were found in the page snapshot.\n';
            }

            comments.forEach(
                (
                    comment,
                    index
                ) => {
                    output +=
                        `\n--- Comment ${index + 1} ---\n`;

                    output +=
                        `Type: ${
                            comment.private
                                ? 'PRIVATE NOTE'
                                : 'PUBLIC/EMAIL'
                        }\n`;

                    if (
                        comment.subject
                    ) {
                        output +=
                            `Subject: ${comment.subject}\n`;
                    }

                    if (
                        comment.author
                    ) {
                        output +=
                            `Author: ${comment.author}\n`;
                    }

                    if (
                        comment.date
                    ) {
                        output +=
                            `Date: ${comment.date}\n`;
                    }

                    output +=
                        `\n${comment.body}\n`;
                }
            );
        }

        if (
            output.length >
            MAX_TICKET_CONTEXT_CHARS
        ) {
            output =
                output.slice(
                    0,
                    MAX_TICKET_CONTEXT_CHARS
                ) +
                '\n\n[Page snapshot truncated by Syncro ChatGPT Ticket Helper]';
        }

        return output;
    }

    // ------------------------------------------------------------
    // Prompt generation
    // ------------------------------------------------------------

    function selectedSources() {
        const useSyncro =
            document.getElementById(
                'tns-gpt-use-syncro'
            )?.checked ?? true;

        const includeSnapshot =
            document.getElementById(
                'tns-gpt-use-snapshot'
            )?.checked ?? true;

        const linkedChat =
            getLinkedChatInfo();

        const includeLinkedChat =
            Boolean(linkedChat) &&
            (
                document.getElementById(
                    'tns-gpt-include-linked-chat'
                )?.checked ?? true
            );

        return {
            useSyncro,
            includeSnapshot,
            linkedChat,
            includeLinkedChat
        };
    }

    async function buildFullPrompt() {
        const request =
            document.getElementById(
                'tns-gpt-request'
            )?.value.trim() ||
            (
                'Review this ticket, summarize the situation, ' +
                'identify anything that requires attention, ' +
                'and suggest reasonable next steps.'
            );

        const {
            useSyncro,
            includeSnapshot,
            linkedChat,
            includeLinkedChat
        } =
            selectedSources();

        const ticketNumber =
            getTicketNumber();

        const subject =
            getTicketSubject();

        let output =
            'I am working on a Syncro MSP support ticket.\n\n';

        if (ticketNumber) {
            output +=
                `Current ticket: #${ticketNumber}\n`;
        }

        if (subject) {
            output +=
                `Subject: ${subject}\n`;
        }

        if (includeLinkedChat) {
            output +=
                `Linked Syncro Chat: #${linkedChat.id}\n`;
        }

        output += '\n';

        if (useSyncro) {
            output +=
                'LIVE SYNCRO DATA\n' +
                '================\n\n';

            output +=
                `Use @Syncro to retrieve the current live Syncro ticket${
                    ticketNumber
                        ? ` #${ticketNumber}`
                        : ''
                } before answering.\n\n`;

            output +=
                'Use the live Syncro ticket as the primary source of truth for ticket fields and ticket communications. ' +
                'You may use Syncro read actions as needed to inspect the ticket, customer, contact, assets, timers, worksheets, appointments, and other relevant ticket information.\n\n';

            output +=
                'Do not make changes to Syncro unless I explicitly ask you to do so. ' +
                'Reading Syncro data does not require additional confirmation.\n\n';

            if (
                includeSnapshot ||
                includeLinkedChat
            ) {
                output +=
                    'Browser-captured context is included below as additional/fallback context. ' +
                    'If @Syncro works, prefer live Syncro data for ticket fields and ticket communications. ' +
                    'When a linked Syncro Chat transcript is included, treat it as original conversation context that may contain details not exposed by @Syncro. ' +
                    'If the sources disagree, tell me about the discrepancy.\n\n';

                output +=
                    'If @Syncro is unavailable, disconnected, or errors, continue from the browser-captured context instead of stopping. ' +
                    'Briefly tell me that live Syncro retrieval was unavailable.\n\n';

            } else {
                output +=
                    'If @Syncro is unavailable or cannot retrieve the ticket, tell me rather than inventing missing information.\n\n';
            }
        }

        if (
            !useSyncro &&
            (
                includeSnapshot ||
                includeLinkedChat
            )
        ) {
            output +=
                'SOURCE DATA\n' +
                '===========\n\n';

            output +=
                'Use the browser-captured Syncro context below as the source of truth. ' +
                'Do not invent details not present in it.\n\n';
        }

        if (includeLinkedChat) {
            output +=
                'The ticket was created from or linked to a Syncro Chat. ' +
                'Review the linked chat transcript as part of the ticket history. ' +
                'Do not assume the issue was resolved unless the chat or ticket clearly establishes the resolution.\n\n';
        }

        output +=
            'MY REQUEST\n' +
            '==========\n' +
            `${request}\n`;

        const sections = [];

        if (includeSnapshot) {
            sections.push(
                buildTicketContext()
            );
        }

        if (includeLinkedChat) {
            sections.push(
                await buildLinkedChatContext()
            );
        }

        if (
            sections.length
        ) {
            output +=
                '\n\n' +
                sections
                    .filter(Boolean)
                    .join('\n\n');
        }

        return output;
    }

    async function copyPrompt(
        openNewChat
    ) {
        const {
            useSyncro,
            includeSnapshot,
            includeLinkedChat
        } =
            selectedSources();

        if (
            !useSyncro &&
            !includeSnapshot &&
            !includeLinkedChat
        ) {
            setStatus(
                'Enable @Syncro, the page snapshot, or the linked chat transcript first.',
                true
            );

            return;
        }

        try {
            setStatus(
                includeLinkedChat
                    ? 'Preparing ticket and linked-chat context…'
                    : 'Preparing ticket context…'
            );

            const prompt =
                await buildFullPrompt();

            GM_setClipboard(
                prompt,
                'text'
            );

            if (openNewChat) {
                setStatus(
                    'Prompt copied. Opening a clean ChatGPT conversation — paste with Ctrl+V.'
                );

                GM_openInTab(
                    CHATGPT_URL,
                    {
                        active:
                            true,
                        insert:
                            true,
                        setParent:
                            true
                    }
                );

            } else {
                setStatus(
                    'Prompt copied to clipboard.'
                );
            }

        } catch (error) {
            console.error(
                '[TNS ChatGPT Helper] Failed to build prompt.',
                error
            );

            setStatus(
                error?.message ||
                'Could not prepare the ChatGPT prompt.',
                true
            );
        }
    }

    // ------------------------------------------------------------
    // Syncro Public/Private Note preparation
    // ------------------------------------------------------------

    function getCommentForm() {
        const forms = [
            ...document.querySelectorAll(
                'form#new_comment'
            )
        ];

        return (
            forms.find(
                form =>
                    isVisible(
                        form.querySelector(
                            '.note-editor, .note-editable'
                        )
                    )
            ) ||
            forms.find(
                isVisible
            ) ||
            forms[0] ||
            null
        );
    }

    function selectSyncroNoteType(type) {
        const form =
            getCommentForm();

        if (!form) {
            throw new Error(
                'Could not find the Syncro comment form.'
            );
        }

        const link =
            form.querySelector(
                `a[data-type="${type}"]`
            );

        if (link) {
            link.click();
            return;
        }

        const hidden =
            form.querySelector(
                '#comment_message_type'
            );

        if (!hidden) {
            throw new Error(
                'Could not locate Syncro message type controls.'
            );
        }

        hidden.value =
            type;

        hidden.dispatchEvent(
            new Event(
                'change',
                {
                    bubbles:
                        true
                }
            )
        );
    }

    async function prepareSyncroNote(type) {
        try {
            selectSyncroNoteType(
                type
            );

            await sleep(
                900
            );

            const form =
                getCommentForm();

            const editor =
                form?.querySelector(
                    '.note-editable'
                );

            const container =
                form?.querySelector(
                    '.note-editor'
                );

            if (
                !form ||
                !editor
            ) {
                throw new Error(
                    'Could not find the Syncro rich-text editor.'
                );
            }

            (
                container ||
                editor
            ).scrollIntoView({
                behavior:
                    'smooth',
                block:
                    'center'
            });

            await sleep(
                400
            );

            editor.focus();

            try {
                const range =
                    document.createRange();

                range.selectNodeContents(
                    editor
                );

                range.collapse(
                    false
                );

                const selection =
                    window.getSelection();

                selection.removeAllRanges();

                selection.addRange(
                    range
                );

            } catch (error) {
                console.debug(
                    '[TNS ChatGPT Helper] Could not place caret.',
                    error
                );
            }

            setStatus(
                `${
                    type === 'internal'
                        ? 'PRIVATE'
                        : 'PUBLIC'
                } NOTE ready — press Ctrl+V to paste the ChatGPT response.`
            );

        } catch (error) {
            console.error(
                '[TNS ChatGPT Helper] Could not prepare Syncro note.',
                error
            );

            setStatus(
                error?.message ||
                'Unable to prepare the Syncro comment editor.',
                true
            );
        }
    }

    // ------------------------------------------------------------
    // Preview / UI state
    // ------------------------------------------------------------

    function updateOptionStates() {
        const snapshotEnabled =
            document.getElementById(
                'tns-gpt-use-snapshot'
            )?.checked ?? true;

        const comments =
            document.getElementById(
                'tns-gpt-include-comments'
            );

        const privateNotes =
            document.getElementById(
                'tns-gpt-include-private'
            );

        if (comments) {
            comments.disabled =
                !snapshotEnabled;
        }

        if (privateNotes) {
            privateNotes.disabled =
                !snapshotEnabled ||
                !(
                    comments?.checked ??
                    true
                );
        }

        updateLinkedChatUI();
    }

    async function refreshPreview(
        showMessage = true
    ) {
        const preview =
            document.getElementById(
                'tns-gpt-context-preview'
            );

        if (!preview) {
            return;
        }

        updateOptionStates();

        const {
            includeSnapshot,
            linkedChat,
            includeLinkedChat
        } =
            selectedSources();

        const sections = [];

        if (includeSnapshot) {
            sections.push(
                buildTicketContext()
            );
        }

        if (includeLinkedChat) {
            preview.textContent =
                [
                    ...sections,
                    (
                        'LINKED SYNCRO CHAT\n' +
                        '==================\n\n' +
                        `Chat ID: #${linkedChat.id}\n` +
                        'Loading transcript…'
                    )
                ]
                    .filter(Boolean)
                    .join('\n\n');

            sections.push(
                await buildLinkedChatContext()
            );
        }

        preview.textContent =
            sections.length
                ? sections
                    .filter(Boolean)
                    .join('\n\n')
                : (
                    'Browser fallback context is disabled.\n\n' +
                    'ChatGPT will be instructed to retrieve the ticket using @Syncro.'
                );

        updateOptionStates();

        if (showMessage) {
            setStatus(
                'Ticket context refreshed.'
            );
        }
    }

    function setQuickPrompt(text) {
        const input =
            document.getElementById(
                'tns-gpt-request'
            );

        if (!input) {
            return;
        }

        input.value =
            text;

        input.focus();
    }

    // ------------------------------------------------------------
    // Panel
    // ------------------------------------------------------------

    function createPanel() {
        const panel =
            document.createElement(
                'div'
            );

        panel.id =
            PANEL_ID;

        panel.innerHTML = `
            <div class="tns-gpt-header">

                <div class="tns-gpt-title">
                    <span class="tns-gpt-icon">✦</span>
                    <span>ChatGPT</span>
                </div>

                <div class="tns-gpt-header-right">
                    <span class="tns-gpt-subtitle">
                        Syncro Ticket Helper
                    </span>

                    <span class="tns-gpt-chevron">
                        ▼
                    </span>
                </div>

            </div>

            <div class="tns-gpt-body">

                <label
                    class="tns-gpt-label"
                    for="tns-gpt-request"
                >
                    What do you want ChatGPT to do?
                </label>

                <textarea
                    id="tns-gpt-request"
                    class="tns-gpt-textarea"
                    placeholder="Example: Review this ticket and tell me what I should do next."
                ></textarea>

                <div class="tns-gpt-quick-prompts">

                    <button
                        type="button"
                        class="btn btn-default btn-sm"
                        data-prompt="summarize"
                    >
                        Summarize
                    </button>

                    <button
                        type="button"
                        class="btn btn-default btn-sm"
                        data-prompt="next"
                    >
                        Next Steps
                    </button>

                    <button
                        type="button"
                        class="btn btn-default btn-sm"
                        data-prompt="public"
                    >
                        Draft Public Note
                    </button>

                    <button
                        type="button"
                        class="btn btn-default btn-sm"
                        data-prompt="troubleshoot"
                    >
                        Troubleshoot
                    </button>

                </div>

                <div class="tns-gpt-source-box">

                    <div class="tns-gpt-source-title">
                        Ticket Data Sources
                    </div>

                    <label class="tns-gpt-source-option">

                        <input
                            type="checkbox"
                            id="tns-gpt-use-syncro"
                            checked
                        >

                        <span>
                            <strong>
                                Use @Syncro live data
                            </strong>

                            <small>
                                ChatGPT retrieves the current live ticket through the Syncro integration.
                            </small>
                        </span>

                    </label>

                    <label class="tns-gpt-source-option">

                        <input
                            type="checkbox"
                            id="tns-gpt-use-snapshot"
                            checked
                        >

                        <span>
                            <strong>
                                Include page snapshot fallback
                            </strong>

                            <small>
                                Copies ticket information from this page if @Syncro is unavailable.
                            </small>
                        </span>

                    </label>

                    <label
                        id="tns-gpt-linked-chat-option"
                        class="tns-gpt-source-option"
                        style="display:none;"
                    >

                        <input
                            type="checkbox"
                            id="tns-gpt-include-linked-chat"
                            checked
                        >

                        <span>
                            <strong>
                                Include linked Syncro Chat transcript
                            </strong>

                            <small
                                id="tns-gpt-linked-chat-status"
                            >
                                Linked chat detected.
                            </small>
                        </span>

                    </label>

                </div>

                <div class="tns-gpt-options">

                    <label>
                        <input
                            type="checkbox"
                            id="tns-gpt-include-comments"
                            checked
                        >
                        Include ticket communications in snapshot
                    </label>

                    <label>
                        <input
                            type="checkbox"
                            id="tns-gpt-include-private"
                            checked
                        >
                        Include private notes in snapshot
                    </label>

                </div>

                <div class="tns-gpt-buttons">

                    <button
                        type="button"
                        id="tns-gpt-new-chat"
                        class="btn btn-primary btn-sm"
                    >
                        Copy + New Chat
                    </button>

                    <button
                        type="button"
                        id="tns-gpt-copy"
                        class="btn btn-default btn-sm"
                    >
                        Copy Only
                    </button>

                    <button
                        type="button"
                        id="tns-gpt-refresh"
                        class="btn btn-default btn-sm"
                    >
                        Refresh Context
                    </button>

                </div>

                <details class="tns-gpt-preview-details">

                    <summary>
                        Page Snapshot Preview
                    </summary>

                    <pre
                        id="tns-gpt-context-preview"
                    ></pre>

                </details>

                <div class="tns-gpt-section-divider"></div>

                <div class="tns-gpt-return-box">

                    <div class="tns-gpt-return-title">
                        Return from ChatGPT
                    </div>

                    <div class="tns-gpt-return-description">
                        Copy ChatGPT's response, return to this ticket,
                        choose Public or Private Note, then press Ctrl+V.
                    </div>

                    <div class="tns-gpt-return-buttons">

                        <button
                            type="button"
                            id="tns-gpt-ready-public"
                            class="btn btn-default btn-sm"
                        >
                            Ready → Public Note
                        </button>

                        <button
                            type="button"
                            id="tns-gpt-ready-private"
                            class="btn btn-default btn-sm"
                        >
                            Ready → Private Note
                        </button>

                    </div>

                    <div class="tns-gpt-safe-note">
                        The helper only prepares and focuses the Syncro editor.
                        You paste the response with Ctrl+V, review it,
                        and submit it yourself.
                    </div>

                </div>

                <div id="tns-gpt-status"></div>

            </div>
        `;

        return panel;
    }

    function wirePanel(panel) {
        const header =
            panel.querySelector(
                '.tns-gpt-header'
            );

        const body =
            panel.querySelector(
                '.tns-gpt-body'
            );

        const chevron =
            panel.querySelector(
                '.tns-gpt-chevron'
            );

        let collapsed =
            localStorage.getItem(
                STORAGE_KEY
            ) === 'true';

        function applyCollapsedState() {
            body.style.display =
                collapsed
                    ? 'none'
                    : 'block';

            chevron.textContent =
                collapsed
                    ? '▶'
                    : '▼';
        }

        applyCollapsedState();

        header.addEventListener(
            'click',
            () => {
                collapsed =
                    !collapsed;

                localStorage.setItem(
                    STORAGE_KEY,
                    String(collapsed)
                );

                applyCollapsedState();

                if (!collapsed) {
                    refreshPreview(
                        false
                    ).catch(
                        console.error
                    );
                }
            }
        );

        panel
            .querySelector(
                '#tns-gpt-new-chat'
            )
            .addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    copyPrompt(
                        true
                    );
                }
            );

        panel
            .querySelector(
                '#tns-gpt-copy'
            )
            .addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    copyPrompt(
                        false
                    );
                }
            );

        panel
            .querySelector(
                '#tns-gpt-refresh'
            )
            .addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    refreshPreview(
                        true
                    ).catch(
                        error => {
                            console.error(
                                '[TNS ChatGPT Helper] Preview refresh failed.',
                                error
                            );

                            setStatus(
                                error?.message ||
                                'Could not refresh ticket context.',
                                true
                            );
                        }
                    );
                }
            );

        panel
            .querySelector(
                '#tns-gpt-ready-public'
            )
            .addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    prepareSyncroNote(
                        'external'
                    );
                }
            );

        panel
            .querySelector(
                '#tns-gpt-ready-private'
            )
            .addEventListener(
                'click',
                event => {
                    event.stopPropagation();

                    prepareSyncroNote(
                        'internal'
                    );
                }
            );

        [
            '#tns-gpt-use-syncro',
            '#tns-gpt-use-snapshot',
            '#tns-gpt-include-linked-chat',
            '#tns-gpt-include-private'
        ].forEach(
            selector => {
                panel
                    .querySelector(
                        selector
                    )
                    ?.addEventListener(
                        'change',
                        () => {
                            refreshPreview(
                                false
                            ).catch(
                                console.error
                            );
                        }
                    );
            }
        );

        panel
            .querySelector(
                '#tns-gpt-include-comments'
            )
            .addEventListener(
                'change',
                () => {
                    updateOptionStates();

                    refreshPreview(
                        false
                    ).catch(
                        console.error
                    );
                }
            );

        panel
            .querySelectorAll(
                '[data-prompt]'
            )
            .forEach(
                button => {
                    button.addEventListener(
                        'click',
                        () => {
                            const prompts = {
                                summarize:
                                    'Summarize this ticket for me. Explain what has happened so far, the current situation, and anything important I should notice.',

                                next:
                                    'Review this ticket and tell me the most reasonable next steps. Separate anything that clearly needs action from anything that is informational only.',

                                public:
                                    'Draft a concise public-facing Syncro ticket note for the customer based on this ticket. Keep it professional and easy to understand. Do not expose private/internal information. Do not post it to Syncro unless I explicitly ask you to.',

                                troubleshoot:
                                    'Help me troubleshoot this ticket. Based on the available information, identify likely causes, what has already been established, and what I should check next.'
                            };

                            if (
                                prompts[
                                    button.dataset.prompt
                                ]
                            ) {
                                setQuickPrompt(
                                    prompts[
                                        button.dataset.prompt
                                    ]
                                );
                            }
                        }
                    );
                }
            );

        setTimeout(
            () => {
                updateOptionStates();

                refreshPreview(
                    false
                ).catch(
                    console.error
                );
            },
            1000
        );
    }

    function mountPanel() {
        if (
            document.getElementById(
                PANEL_ID
            )
        ) {
            return true;
        }

        const summary =
            document.getElementById(
                'ticket_details_widget_ai_summary'
            );

        if (!summary) {
            return false;
        }

        const panel =
            createPanel();

        summary.insertAdjacentElement(
            'afterend',
            panel
        );

        wirePanel(
            panel
        );

        return true;
    }

    // ------------------------------------------------------------
    // Styling
    // ------------------------------------------------------------

    const style =
        document.createElement(
            'style'
        );

    style.textContent = `
        #${PANEL_ID} {
            border: 1px solid #c5c5c5;
            border-radius: 6px;
            overflow: hidden;
            background: #fff;
            color: #333;
            width: 100%;
        }

        #${PANEL_ID} .tns-gpt-header {
            min-height: 44px;
            padding: 0 16px;
            display: flex;
            align-items: center;
            justify-content: space-between;
            cursor: pointer;
            user-select: none;
            background: #f4f4f4;
        }

        #${PANEL_ID} .tns-gpt-title,
        #${PANEL_ID} .tns-gpt-header-right {
            display: flex;
            align-items: center;
            gap: 9px;
        }

        #${PANEL_ID} .tns-gpt-title {
            font-weight: 600;
            font-size: 14px;
        }

        #${PANEL_ID} .tns-gpt-icon {
            font-size: 17px;
        }

        #${PANEL_ID} .tns-gpt-subtitle {
            opacity: .65;
            font-size: 12px;
        }

        #${PANEL_ID} .tns-gpt-chevron {
            font-size: 11px;
            width: 15px;
            text-align: center;
        }

        #${PANEL_ID} .tns-gpt-body {
            padding: 16px 18px 18px;
            border-top: 1px solid #c5c5c5;
        }

        #${PANEL_ID} .tns-gpt-label {
            display: block;
            margin-bottom: 7px;
            font-weight: 600;
        }

        #${PANEL_ID} .tns-gpt-textarea {
            width: 100%;
            min-height: 95px;
            resize: vertical;
            border: 1px solid #aaa;
            border-radius: 4px;
            padding: 10px;
            box-sizing: border-box;
            font: inherit;
            background: #fff;
            color: #333;
        }

        #${PANEL_ID} .tns-gpt-quick-prompts,
        #${PANEL_ID} .tns-gpt-buttons,
        #${PANEL_ID} .tns-gpt-return-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 7px;
        }

        #${PANEL_ID} .tns-gpt-quick-prompts {
            margin-top: 9px;
        }

        #${PANEL_ID} .tns-gpt-source-box,
        #${PANEL_ID} .tns-gpt-return-box {
            margin-top: 15px;
            padding: 12px;
            border: 1px solid #d0d0d0;
            border-radius: 5px;
        }

        #${PANEL_ID} .tns-gpt-source-title,
        #${PANEL_ID} .tns-gpt-return-title {
            font-weight: 600;
            margin-bottom: 9px;
        }

        #${PANEL_ID} .tns-gpt-source-option {
            display: flex;
            align-items: flex-start;
            gap: 8px;
            margin: 9px 0;
            cursor: pointer;
            font-weight: normal;
        }

        #${PANEL_ID} .tns-gpt-source-option input {
            margin-top: 3px;
        }

        #${PANEL_ID} .tns-gpt-source-option span {
            display: flex;
            flex-direction: column;
        }

        #${PANEL_ID} .tns-gpt-source-option small {
            opacity: .7;
            margin-top: 2px;
            line-height: 1.35;
        }

        #${PANEL_ID} .tns-gpt-options {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin: 14px 0;
            font-size: 13px;
        }

        #${PANEL_ID} .tns-gpt-options label {
            font-weight: normal;
            margin: 0;
            cursor: pointer;
        }

        #${PANEL_ID} .tns-gpt-options input {
            margin-right: 5px;
        }

        #${PANEL_ID} .tns-gpt-preview-details {
            margin-top: 15px;
        }

        #${PANEL_ID} .tns-gpt-preview-details summary {
            cursor: pointer;
            font-weight: 600;
            user-select: none;
        }

        #${PANEL_ID} #tns-gpt-context-preview {
            margin-top: 10px;
            margin-bottom: 0;
            padding: 12px;
            max-height: 360px;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
            border: 1px solid #ccc;
            border-radius: 4px;
            background: #f7f7f7;
            font-family: monospace;
            font-size: 12px;
            line-height: 1.45;
        }

        #${PANEL_ID} .tns-gpt-section-divider {
            height: 1px;
            background: #d0d0d0;
            margin: 18px 0;
        }

        #${PANEL_ID} .tns-gpt-return-box {
            margin-top: 0;
        }

        #${PANEL_ID} .tns-gpt-return-description {
            margin-bottom: 10px;
            opacity: .8;
            font-size: 13px;
        }

        #${PANEL_ID} .tns-gpt-safe-note {
            margin-top: 9px;
            font-size: 12px;
            opacity: .7;
            line-height: 1.4;
        }

        #${PANEL_ID} #tns-gpt-status {
            height: 0;
            opacity: 0;
            overflow: hidden;
            transition: opacity .2s ease;
            font-size: 12px;
        }

        #${PANEL_ID} #tns-gpt-status.show {
            height: auto;
            opacity: .9;
            margin-top: 10px;
        }

        #${PANEL_ID} #tns-gpt-status.error {
            color: #e45d5d;
            opacity: 1;
        }

        body.dark #${PANEL_ID} {
            background: #202020;
            border-color: #575757;
            color: #ddd;
        }

        body.dark #${PANEL_ID} .tns-gpt-header {
            background: #343434;
        }

        body.dark #${PANEL_ID} .tns-gpt-body {
            border-top-color: #575757;
        }

        body.dark #${PANEL_ID} .tns-gpt-textarea {
            background: #1c1c1c;
            color: #eee;
            border-color: #555;
        }

        body.dark #${PANEL_ID} .tns-gpt-textarea::placeholder {
            color: #888;
        }

        body.dark #${PANEL_ID} .tns-gpt-source-box,
        body.dark #${PANEL_ID} .tns-gpt-return-box {
            border-color: #4b4b4b;
            background: #252525;
        }

        body.dark #${PANEL_ID} #tns-gpt-context-preview {
            background: #191919;
            color: #d8d8d8;
            border-color: #4b4b4b;
        }

        body.dark #${PANEL_ID} .tns-gpt-section-divider {
            background: #4b4b4b;
        }
    `;

    document.head.appendChild(
        style
    );

    // ------------------------------------------------------------
    // Mount and rerender protection
    // ------------------------------------------------------------

    mountPanel();

    let mountTimer =
        null;

    const observer =
        new MutationObserver(
            () => {
                if (
                    document.getElementById(
                        PANEL_ID
                    )
                ) {
                    return;
                }

                clearTimeout(
                    mountTimer
                );

                mountTimer =
                    setTimeout(
                        mountPanel,
                        100
                    );
            }
        );

    observer.observe(
        document.body,
        {
            childList:
                true,
            subtree:
                true
        }
    );

})();
