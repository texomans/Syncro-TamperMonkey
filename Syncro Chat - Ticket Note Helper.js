// ==UserScript==
// @name         Syncro Chat - Ticket Note Helper
// @namespace    https://texomans.com/
// @version      1.0.1
// @description  Copies the selected Syncro Chat transcript or prepares it for ChatGPT to summarize as Issue / Details / Actions / Status ticket notes.
// @match        https://*.syncromsp.com/chat
// @match        https://*.syncromsp.com/chat/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Chat%20-%20Ticket%20Note%20Helper.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Chat%20-%20Ticket%20Note%20Helper.js
// @run-at       document-idle
// @grant        GM_setClipboard
// @grant        GM_openInTab
// ==/UserScript==

(function () {
    'use strict';

    const HELPER_ID = 'tns-syncro-chat-ticket-note-helper';
    const STATUS_ID = 'tns-syncro-chat-ticket-note-status';
    const STYLE_ID = 'tns-syncro-chat-ticket-note-style';
    const CHATGPT_URL = 'https://chatgpt.com/';
    const MAX_TRANSCRIPT_CHARS = 60000;

    const MESSAGE_SELECTORS = [
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

    const AUTHOR_SELECTORS = [
        '[data-testid*="author"]',
        '[data-testid*="sender"]',
        '[class*="author"]',
        '[class*="sender"]',
        '[class*="message-name"]',
        '[class*="messageName"]',
        '[class*="user-name"]',
        '[class*="userName"]'
    ];

    const TIME_SELECTORS = [
        'time',
        '[data-testid*="time"]',
        '[class*="timestamp"]',
        '[class*="time-stamp"]',
        '[class*="message-time"]',
        '[class*="messageTime"]'
    ];

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
        if (!element) return '';

        return cleanText(
            element.innerText ||
            element.textContent ||
            ''
        );
    }

    function isVisible(element) {
        if (
            !element ||
            !(element instanceof Element)
        ) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

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

    function normalizeButtonText(element) {
        return cleanText(
            element?.textContent || ''
        )
            .replace(/\s+/g, ' ')
            .trim();
    }

    function findCreateTicketButton() {
        return [
            ...document.querySelectorAll(
                'a, button'
            )
        ].find(element => {

            if (!isVisible(element)) {
                return false;
            }

            return /^create ticket$/i.test(
                normalizeButtonText(element)
            );

        }) || null;
    }

    function findLikelyComposer(
        referenceElement
    ) {
        const candidates = [
            ...document.querySelectorAll(
                'textarea, [contenteditable="true"], input[type="text"]'
            )
        ].filter(element => {

            if (!isVisible(element)) {
                return false;
            }

            if (
                element.closest(
                    `#${HELPER_ID}`
                )
            ) {
                return false;
            }

            const placeholder =
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
                /message|chat|reply|type|send/i.test(
                    placeholder
                ) ||
                (
                    rect.width >= 200 &&
                    rect.top >
                    window.innerHeight * 0.45
                )
            );
        });

        if (!candidates.length) {
            return null;
        }

        if (!referenceElement) {
            return candidates[
                candidates.length - 1
            ];
        }

        const referenceRect =
            referenceElement
                .getBoundingClientRect();

        const referenceCenterX =
            referenceRect.left +
            referenceRect.width / 2;

        candidates.sort(
            (a, b) => {

                const ar =
                    a.getBoundingClientRect();

                const br =
                    b.getBoundingClientRect();

                const ax =
                    Math.abs(
                        (
                            ar.left +
                            ar.width / 2
                        ) -
                        referenceCenterX
                    );

                const bx =
                    Math.abs(
                        (
                            br.left +
                            br.width / 2
                        ) -
                        referenceCenterX
                    );

                const aBottomBias =
                    Math.abs(
                        window.innerHeight -
                        ar.bottom
                    );

                const bBottomBias =
                    Math.abs(
                        window.innerHeight -
                        br.bottom
                    );

                return (
                    ax +
                    aBottomBias * 0.25
                ) - (
                    bx +
                    bBottomBias * 0.25
                );
            }
        );

        return candidates[0];
    }

    function ancestorChain(element) {
        const chain = [];

        let node = element;

        while (
            node &&
            node instanceof Element
        ) {
            chain.push(node);

            if (node === document.body) {
                break;
            }

            node = node.parentElement;
        }

        return chain;
    }

    function findCommonAncestor(a, b) {
        if (!a || !b) {
            return null;
        }

        const bAncestors =
            new Set(
                ancestorChain(b)
            );

        return ancestorChain(a)
            .find(
                node =>
                    bAncestors.has(node)
            ) || null;
    }

    function scoreChatRoot(
        element,
        createTicketButton,
        composer
    ) {
        if (
            !element ||
            element ===
            document.documentElement
        ) {
            return -Infinity;
        }

        const rect =
            element.getBoundingClientRect();

        if (
            rect.width < 300 ||
            rect.height < 250
        ) {
            return -Infinity;
        }

        let score = 0;

        if (
            element.contains(
                createTicketButton
            )
        ) {
            score += 20;
        }

        if (
            composer &&
            element.contains(composer)
        ) {
            score += 25;
        }

        const text =
            elementText(element)
                .toLowerCase();

        if (
            text.includes(
                'create ticket'
            )
        ) {
            score += 5;
        }

        if (
            text.includes(
                'details'
            )
        ) {
            score += 1;
        }

        const messageCount =
            MESSAGE_SELECTORS.reduce(
                (
                    total,
                    selector
                ) =>
                    total +
                    element
                        .querySelectorAll(
                            selector
                        ).length,
                0
            );

        score +=
            Math.min(
                messageCount,
                20
            ) * 2;

        const areaPenalty =
            (
                rect.width *
                rect.height
            ) / 250000;

        score -= areaPenalty;

        return score;
    }

    function findActiveChatRoot(
        createTicketButton
    ) {
        const composer =
            findLikelyComposer(
                createTicketButton
            );

        const common =
            findCommonAncestor(
                createTicketButton,
                composer
            );

        const candidates =
            new Set();

        if (common) {
            let node = common;

            for (
                let i = 0;
                node && i < 5;
                i += 1
            ) {
                candidates.add(node);

                node =
                    node.parentElement;
            }
        }

        if (createTicketButton) {
            ancestorChain(
                createTicketButton
            )
                .slice(0, 8)
                .forEach(
                    node => {
                        candidates.add(
                            node
                        );
                    }
                );
        }

        if (composer) {
            ancestorChain(composer)
                .slice(0, 8)
                .forEach(
                    node => {
                        candidates.add(
                            node
                        );
                    }
                );
        }

        const ranked = [
            ...candidates
        ]
            .map(
                element => ({
                    element,
                    score:
                        scoreChatRoot(
                            element,
                            createTicketButton,
                            composer
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
            createTicketButton
                ?.parentElement ||
            document.body
        );
    }

    function nodeLooksLikeControl(
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

        if (
            element.closest(
                `#${HELPER_ID}`
            )
        ) {
            return true;
        }

        const text =
            elementText(element);

        if (!text) {
            return true;
        }

        if (
            /^(create ticket|details|assign to me|re-assign|close empty chat|send)$/i
                .test(text)
        ) {
            return true;
        }

        return false;
    }

    function getLeafMessageCandidates(
        root
    ) {
        const found = [];
        const seen = new Set();

        MESSAGE_SELECTORS
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
                                    !isVisible(
                                        element
                                    )
                                ) {
                                    return;
                                }

                                if (
                                    nodeLooksLikeControl(
                                        element
                                    )
                                ) {
                                    return;
                                }

                                const text =
                                    elementText(
                                        element
                                    );

                                if (
                                    !text ||
                                    text.length < 1 ||
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
                                other ===
                                element
                            ) {
                                return false;
                            }

                            if (
                                !element.contains(
                                    other
                                )
                            ) {
                                return false;
                            }

                            const outerText =
                                elementText(
                                    element
                                );

                            const innerText =
                                elementText(
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

                if (
                    pos &
                    Node
                        .DOCUMENT_POSITION_FOLLOWING
                ) {
                    return -1;
                }

                if (
                    pos &
                    Node
                        .DOCUMENT_POSITION_PRECEDING
                ) {
                    return 1;
                }

                return 0;
            }
        );
    }

    function extractFirstMatchText(
        messageElement,
        selectors
    ) {
        for (
            const selector
            of selectors
        ) {
            const match =
                messageElement
                    .querySelector(
                        selector
                    );

            const text =
                elementText(match);

            if (text) {
                return text;
            }
        }

        return '';
    }

    function extractMessageBody(
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
                AUTHOR_SELECTORS.join(',')
            )
            .forEach(
                element =>
                    element.remove()
            );

        clone
            .querySelectorAll(
                TIME_SELECTORS.join(',')
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
                        document
                            .createTextNode(
                                '\n'
                            )
                    );
                }
            );

        let body =
            elementText(clone);

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

    function buildStructuredTranscript(
        root
    ) {
        const candidates =
            getLeafMessageCandidates(
                root
            );

        if (
            candidates.length < 2
        ) {
            return null;
        }

        const messages =
            candidates
                .map(
                    (
                        element,
                        index
                    ) => {

                        const author =
                            extractFirstMatchText(
                                element,
                                AUTHOR_SELECTORS
                            );

                        const time =
                            extractFirstMatchText(
                                element,
                                TIME_SELECTORS
                            );

                        const body =
                            extractMessageBody(
                                element,
                                author,
                                time
                            ) ||
                            elementText(
                                element
                            );

                        if (!body) {
                            return null;
                        }

                        const headerParts = [];

                        if (author) {
                            headerParts.push(
                                author
                            );
                        }

                        if (time) {
                            headerParts.push(
                                time
                            );
                        }

                        return {
                            index:
                                index + 1,
                            author,
                            time,
                            body,
                            line:
                                `${index + 1}. ` +
                                `${headerParts.length
                                    ? `[${headerParts.join(' | ')}] `
                                    : ''
                                }` +
                                `${body}`
                        };
                    }
                )
                .filter(Boolean);

        if (
            messages.length < 2
        ) {
            return null;
        }

        return {
            mode: 'structured',
            messageCount:
                messages.length,
            text:
                messages
                    .map(
                        message =>
                            message.line
                    )
                    .join('\n\n')
        };
    }

    function removeNoiseFromClone(
        clone
    ) {
        clone
            .querySelectorAll(
                [
                    `#${HELPER_ID}`,
                    'script',
                    'style',
                    'noscript',
                    'button',
                    'input',
                    'textarea',
                    'select',
                    'form',
                    'svg',
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
                        document
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
                        document
                            .createTextNode(
                                '\n'
                            )
                    );
                }
            );
    }

    function buildFallbackTranscript(
        root
    ) {
        const clone =
            root.cloneNode(true);

        removeNoiseFromClone(
            clone
        );

        let text =
            elementText(clone);

        text =
            cleanText(
                text
                    .split('\n')
                    .filter(
                        line => {

                            return !/^(create ticket|details|assign to me|re-assign|close empty chat)$/i
                                .test(
                                    cleanText(
                                        line
                                    )
                                );
                        }
                    )
                    .join('\n')
            );

        return {
            mode: 'fallback',
            messageCount: null,
            text
        };
    }

    function getSelectedChatTranscript() {
        const createTicketButton =
            findCreateTicketButton();

        if (!createTicketButton) {
            throw new Error(
                'Select a chat first. I could not find Syncro\'s Create Ticket action.'
            );
        }

        const root =
            findActiveChatRoot(
                createTicketButton
            );

        const structured =
            buildStructuredTranscript(
                root
            );

        const result =
            structured ||
            buildFallbackTranscript(
                root
            );

        if (
            !result.text ||
            result.text.length < 3
        ) {
            throw new Error(
                'I found the selected chat, but could not read any transcript text.'
            );
        }

        if (
            result.text.length >
            MAX_TRANSCRIPT_CHARS
        ) {
            result.text =
                `${result.text.slice(
                    0,
                    MAX_TRANSCRIPT_CHARS
                )}` +
                `\n\n[Transcript truncated at ` +
                `${MAX_TRANSCRIPT_CHARS.toLocaleString()} characters]`;
        }

        return result;
    }

    function buildTranscriptDocument(
        result
    ) {
        const capturedAt =
            new Date()
                .toLocaleString();

        return [
            'SYNCRO CHAT TRANSCRIPT',
            `Source: ${window.location.href}`,
            `Captured: ${capturedAt}`,
            result.messageCount
                ? `Messages detected: ${result.messageCount}`
                : '',
            '',
            result.text
        ]
            .filter(
                (
                    line,
                    index,
                    all
                ) => {

                    if (
                        line !== ''
                    ) {
                        return true;
                    }

                    return (
                        index === 0 ||
                        all[
                            index - 1
                        ] !== ''
                    );
                }
            )
            .join('\n');
    }

    function buildSummaryPrompt(
    result
) {
    const transcript =
        buildTranscriptDocument(
            result
        );

    return `I need a concise internal ticket note from this Syncro live-chat conversation.

First, determine whether there is enough information to create an accurate ticket note.

IMPORTANT FOLLOW-UP RULES:

- If the conversation appears to have concluded, but the resolution or solution is not clearly stated, DO NOT guess the resolution.
- Instead, ask me:
  "What was the resolution/solution for this chat?"
- If the conversation appears to have concluded but it is also unclear what the original issue or request was, ask me:
  "What was this chat regarding, and what was the resolution/solution?"
- If the conversation is clearly still ongoing, unresolved, awaiting information, or awaiting customer confirmation, do not ask for a resolution. Document the current status instead.
- Ask only for information that is genuinely missing.
- Do not manufacture missing context from assumptions.

If enough information exists to create the note, return ONLY the note using exactly these four headings:

Issue:
Details:
Actions:
Status:

Rules for the completed ticket note:

- Use only facts explicitly present in the transcript or facts I provide in response to a follow-up question.
- Do not invent, infer, or assume troubleshooting steps, causes, resolutions, names, devices, or outcomes.
- Keep the note concise but preserve details that would matter to another technician.
- Issue: state the user's reported problem or request.
- Details: include relevant symptoms, context, errors, affected device/user, timing, and clarifications.
- Actions: include only troubleshooting, investigation, changes, instructions, or solutions that were actually performed or explicitly discussed.
- Use bullets under Actions when there is more than one action.
- Status: state the actual ending state of the chat, such as resolved, unresolved, awaiting user confirmation, follow-up required, escalated, or unknown.
- Do not claim the issue was resolved unless the transcript or my follow-up response clearly establishes that it was.
- If the chat clearly ended successfully but the exact solution is missing, ask me for the resolution instead of writing "Not stated in chat."
- Do not include greetings, filler, a preface, a conclusion, or a markdown table.

${transcript}`;
}

    function copyText(text) {
        GM_setClipboard(
            text,
            'text'
        );
    }

    function setStatus(
        message,
        isError = false
    ) {
        const status =
            document.getElementById(
                STATUS_ID
            );

        if (!status) {
            return;
        }

        status.textContent =
            message;

        status.classList.toggle(
            'tns-error',
            isError
        );

        status.classList.add(
            'tns-show'
        );

        clearTimeout(
            setStatus.timeout
        );

        setStatus.timeout =
            window.setTimeout(
                () => {

                    status.classList.remove(
                        'tns-show',
                        'tns-error'
                    );

                },
                7000
            );
    }

    function describeExtraction(
        result
    ) {
        if (
            result.mode ===
            'structured'
        ) {
            return (
                `${result.messageCount} ` +
                `messages detected`
            );
        }

        return (
            'chat text detected ' +
            'using fallback mode'
        );
    }

    function copyTranscript() {
        try {
            const result =
                getSelectedChatTranscript();

            copyText(
                buildTranscriptDocument(
                    result
                )
            );

            setStatus(
                `Transcript copied — ${describeExtraction(result)}.`
            );

        } catch (error) {

            console.error(
                '[Syncro Chat Ticket Note Helper]',
                error
            );

            setStatus(
                error.message ||
                'Could not copy the chat transcript.',
                true
            );
        }
    }

    function summarizeWithChatGPT() {
        try {
            const result =
                getSelectedChatTranscript();

            copyText(
                buildSummaryPrompt(
                    result
                )
            );

            setStatus(
                `Ticket-note prompt copied — ${describeExtraction(result)}. Paste it into the new ChatGPT tab with Ctrl+V.`
            );

            GM_openInTab(
                CHATGPT_URL,
                {
                    active: true,
                    insert: true,
                    setParent: true
                }
            );

        } catch (error) {

            console.error(
                '[Syncro Chat Ticket Note Helper]',
                error
            );

            setStatus(
                error.message ||
                'Could not prepare the ticket-note prompt.',
                true
            );
        }
    }

    function addStyles() {
        if (
            document.getElementById(
                STYLE_ID
            )
        ) {
            return;
        }

        const style =
            document.createElement(
                'style'
            );

        style.id =
            STYLE_ID;

        style.textContent = `
            #${HELPER_ID} {
                display: inline-flex;
                align-items: center;
                gap: 6px;
                margin-right: 6px;
                vertical-align: middle;
            }

            #${HELPER_ID} .tns-chat-note-button {
                white-space: nowrap;
            }

            #${STATUS_ID} {
                position: fixed;
                right: 24px;
                bottom: 24px;
                z-index: 2147483647;
                max-width: 520px;
                padding: 11px 14px;
                border-radius: 5px;
                background: rgba(35, 35, 35, 0.96);
                color: #fff;
                font-size: 13px;
                line-height: 1.4;
                box-shadow: 0 4px 18px rgba(0, 0, 0, 0.28);
                opacity: 0;
                transform: translateY(8px);
                pointer-events: none;
                transition: opacity 0.15s ease, transform 0.15s ease;
            }

            #${STATUS_ID}.tns-show {
                opacity: 1;
                transform: translateY(0);
            }

            #${STATUS_ID}.tns-error {
                background: rgba(150, 35, 35, 0.97);
            }
        `;

        document.head
            .appendChild(style);
    }

    function createHelper() {
        const wrapper =
            document.createElement(
                'span'
            );

        wrapper.id =
            HELPER_ID;

        const transcriptButton =
            document.createElement(
                'button'
            );

        transcriptButton.type =
            'button';

        transcriptButton.className =
            'btn btn-default btn-sm tns-chat-note-button';

        transcriptButton.textContent =
            'Copy Transcript';

        transcriptButton.title =
            'Copy the currently selected Syncro Chat conversation to the clipboard.';

        transcriptButton
            .addEventListener(
                'click',
                event => {

                    event.preventDefault();
                    event.stopPropagation();

                    copyTranscript();
                }
            );

        const summaryButton =
            document.createElement(
                'button'
            );

        summaryButton.type =
            'button';

        summaryButton.className =
            'btn btn-primary btn-sm tns-chat-note-button';

        summaryButton.textContent =
            'Ticket Note → ChatGPT';

        summaryButton.title =
            'Copy the selected chat plus a strict ticket-note prompt, then open a clean ChatGPT tab.';

        summaryButton
            .addEventListener(
                'click',
                event => {

                    event.preventDefault();
                    event.stopPropagation();

                    summarizeWithChatGPT();
                }
            );

        wrapper.append(
            transcriptButton,
            summaryButton
        );

        return wrapper;
    }

    function ensureStatusElement() {
        if (
            document.getElementById(
                STATUS_ID
            )
        ) {
            return;
        }

        const status =
            document.createElement(
                'div'
            );

        status.id =
            STATUS_ID;

        status.setAttribute(
            'role',
            'status'
        );

        document.body
            .appendChild(status);
    }

    function placeHelper() {
        if (
            document.body
                ?.dataset
                ?.currentPage !==
            'chats-show'
        ) {
            document
                .getElementById(
                    HELPER_ID
                )
                ?.remove();

            return;
        }

        const createTicketButton =
            findCreateTicketButton();

        if (!createTicketButton) {
            document
                .getElementById(
                    HELPER_ID
                )
                ?.remove();

            return;
        }

        let helper =
            document.getElementById(
                HELPER_ID
            );

        if (!helper) {
            helper =
                createHelper();
        }

        const parent =
            createTicketButton
                .parentElement;

        if (!parent) {
            return;
        }

        if (
            helper.parentElement !==
            parent
        ) {
            createTicketButton
                .insertAdjacentElement(
                    'beforebegin',
                    helper
                );
        }
    }

    let pending = false;

    function scheduleRefresh() {
        if (pending) {
            return;
        }

        pending = true;

        window.setTimeout(
            () => {

                pending = false;

                addStyles();
                ensureStatusElement();
                placeHelper();

            },
            350
        );
    }

    scheduleRefresh();

    window.addEventListener(
        'load',
        scheduleRefresh
    );

    const observer =
        new MutationObserver(
            scheduleRefresh
        );

    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );
})();
