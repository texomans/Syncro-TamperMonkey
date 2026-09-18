// ==UserScript==
// @name         Syncro Tickets - ChatGPT Ticket Helper
// @namespace    https://texomans.com/
// @version      1.2.2
// @description  ChatGPT ticket helper with @Syncro live data, page fallback, clean new-chat workflow, and Public/Private Note preparation.
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

    const CHATGPT_NEW_URL = 'https://chatgpt.com/';
    const MAX_COMMENTS = 40;
    const MAX_CONTEXT_CHARS = 60000;

    // ============================================================
    // Basic helpers
    // ============================================================

    function cleanText(value) {
        return String(value || '')
            .replace(/\u00a0/g, ' ')
            .replace(/\r/g, '')
            .replace(/[ \t]+\n/g, '\n')
            .replace(/\n[ \t]+/g, '\n')
            .replace(/\n{3,}/g, '\n\n')
            .replace(/[ \t]{2,}/g, ' ')
            .trim();
    }

    function elementText(element) {
        if (!element) {
            return '';
        }

        return cleanText(
            element.innerText ||
            element.textContent ||
            ''
        );
    }

    function getSelectedText(select) {
        if (
            !select ||
            select.selectedIndex < 0
        ) {
            return '';
        }

        return cleanText(
            select.options[
                select.selectedIndex
            ]?.textContent
        );
    }

    function sleep(ms) {
        return new Promise(
            resolve => setTimeout(resolve, ms)
        );
    }

    function isVisible(element) {
        if (!element) {
            return false;
        }

        const style =
            window.getComputedStyle(element);

        return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            (
                element.offsetWidth ||
                element.offsetHeight ||
                element.getClientRects().length
            )
        );
    }

    // ============================================================
    // Ticket information
    // ============================================================

    function getTableValue(label) {
        const normalizedLabel =
            label.toLowerCase();

        const heading = [
            ...document.querySelectorAll('th')
        ].find(th => {
            return (
                cleanText(
                    th.textContent
                ).toLowerCase() ===
                normalizedLabel
            );
        });

        if (!heading) {
            return '';
        }

        const row =
            heading.closest('tr');

        const cell =
            row?.querySelector('td');

        if (!cell) {
            return '';
        }

        const select =
            cell.querySelector('select');

        if (select) {
            return getSelectedText(select);
        }

        return elementText(cell);
    }

    function getTicketNumber() {
        const heading =
            document.querySelector(
                '.rs2-ticket-main h1'
            );

        const headingText =
            elementText(heading);

        const headingMatch =
            headingText.match(
                /#?(\d+)/
            );

        if (headingMatch) {
            return headingMatch[1];
        }

        const titleMatch =
            document.title.match(
                /Ticket\s+(\d+)/i
            );

        if (titleMatch) {
            return titleMatch[1];
        }

        return '';
    }

    function getTicketSubject() {
        return elementText(
            document.querySelector(
                '.ticket-subject-title'
            )
        );
    }

    // ============================================================
    // Ticket communications
    // ============================================================

    function getCommentBody(element) {
        if (!element) {
            return '';
        }

        const clone =
            element.cloneNode(true);

        clone.querySelectorAll(
            'script, style, noscript, button, .hover-actions'
        ).forEach(el => {
            el.remove();
        });

        clone.querySelectorAll(
            'br'
        ).forEach(br => {
            br.replaceWith(
                document.createTextNode('\n')
            );
        });

        clone.querySelectorAll(
            'p, li'
        ).forEach(el => {
            el.appendChild(
                document.createTextNode('\n')
            );
        });

        return cleanText(
            clone.textContent
        );
    }

    function getComments(includePrivate) {
        const nodes = [
            ...document.querySelectorAll(
                '.comment-list > [id^="comment-"]'
            )
        ];

        let comments =
            nodes.map(node => {

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
                    authorElement?.getAttribute(
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
                    dateElement?.getAttribute(
                        'title'
                    ) ||
                    elementText(
                        dateElement
                    );

                const bodyElement =
                    node.querySelector(
                        '[id^="comment-body-"]'
                    );

                const body =
                    getCommentBody(
                        bodyElement
                    );

                if (!body) {
                    return null;
                }

                return {
                    private: isPrivate,
                    author,
                    subject,
                    date,
                    body
                };

            }).filter(Boolean);

        comments =
            comments
                .slice(
                    0,
                    MAX_COMMENTS
                )
                .reverse();

        return comments;
    }

    // ============================================================
    // Page snapshot
    // ============================================================

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
                getTableValue('Status')
            ],
            [
                'Priority',
                getTableValue('Priority')
            ],
            [
                'Assignee',
                getTableValue('Assignee')
            ],
            [
                'Type',
                getTableValue('Type')
            ],
            [
                'Tags',
                getTableValue('Tags')
            ],
            [
                'SLA',
                getTableValue('SLA')
            ],
            [
                'Due Date',
                getTableValue('Due Date')
            ],
            [
                'Customer',
                getTableValue('Customer')
            ],
            [
                'Assigned Contact',
                getTableValue(
                    'Assigned Contact'
                )
            ],
            [
                'Email',
                getTableValue('Email')
            ]
        ].filter(
            ([, value]) => value
        );

        let output =
            'SYNCRO PAGE SNAPSHOT\n';

        output +=
            '====================\n\n';

        for (
            const [name, value]
            of fields
        ) {
            output +=
                `${name}: ${value}\n`;
        }

        output +=
            `URL: ${window.location.href}\n`;

        if (includeComments) {
            const comments =
                getComments(
                    includePrivate
                );

            output +=
                '\nCOMMUNICATIONS\n';

            output +=
                '==============\n';

            if (!comments.length) {
                output +=
                    '\nNo ticket communications were found in the page snapshot.\n';
            }

            comments.forEach(
                (comment, index) => {

                    output += '\n';

                    output +=
                        `--- Comment ${index + 1} ---\n`;

                    output +=
                        `Type: ${
                            comment.private
                                ? 'PRIVATE NOTE'
                                : 'PUBLIC/EMAIL'
                        }\n`;

                    if (comment.subject) {
                        output +=
                            `Subject: ${comment.subject}\n`;
                    }

                    if (comment.author) {
                        output +=
                            `Author: ${comment.author}\n`;
                    }

                    if (comment.date) {
                        output +=
                            `Date: ${comment.date}\n`;
                    }

                    output += '\n';

                    output +=
                        `${comment.body}\n`;
                }
            );
        }

        if (
            output.length >
            MAX_CONTEXT_CHARS
        ) {
            output =
                output.substring(
                    0,
                    MAX_CONTEXT_CHARS
                ) +
                '\n\n[Page snapshot truncated by TNS ChatGPT Ticket Helper]';
        }

        return output;
    }

    // ============================================================
    // Prompt generation
    // ============================================================

    function buildFullPrompt() {
        const request =
            document.getElementById(
                'tns-gpt-request'
            )?.value.trim() ||
            (
                'Review this ticket, summarize the situation, ' +
                'identify anything that requires attention, ' +
                'and suggest reasonable next steps.'
            );

        const useSyncro =
            document.getElementById(
                'tns-gpt-use-syncro'
            )?.checked ?? true;

        const includeSnapshot =
            document.getElementById(
                'tns-gpt-use-snapshot'
            )?.checked ?? true;

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

        output += '\n';

        // --------------------------------------------------------
        // Live @Syncro workflow
        // --------------------------------------------------------

        if (useSyncro) {
            output +=
                'LIVE SYNCRO DATA\n';

            output +=
                '================\n\n';

            output +=
                'Use @Syncro to retrieve the current live Syncro ticket';

            if (ticketNumber) {
                output +=
                    ` #${ticketNumber}`;
            }

            output +=
                ' before answering.\n\n';

            output +=
                'Use the live Syncro ticket as the primary source of truth. ' +
                'You may use Syncro read actions as needed to inspect the ticket, ' +
                'communications, customer, contact, assets, timers, worksheets, ' +
                'appointments, and other relevant ticket information.\n\n';

            output +=
                'Do not make changes to Syncro unless I explicitly ask you to do so. ' +
                'Reading Syncro data does not require additional confirmation.\n\n';

            if (includeSnapshot) {
                output +=
                    'A page snapshot is also included below as a fallback. ' +
                    'If @Syncro works, prefer the live Syncro data over the snapshot. ' +
                    'If the live data and snapshot disagree, tell me about the discrepancy.\n\n';

                output +=
                    'If @Syncro is unavailable, disconnected, errors, or otherwise cannot ' +
                    'retrieve the ticket, continue answering from the PAGE SNAPSHOT instead ' +
                    'of stopping. Briefly tell me that live Syncro retrieval was unavailable.\n\n';
            } else {
                output +=
                    'If @Syncro is unavailable or cannot retrieve the ticket, tell me rather ' +
                    'than inventing or assuming missing ticket information.\n\n';
            }
        }

        // --------------------------------------------------------
        // Snapshot-only workflow
        // --------------------------------------------------------

        if (
            !useSyncro &&
            includeSnapshot
        ) {
            output +=
                'SOURCE DATA\n';

            output +=
                '===========\n\n';

            output +=
                'Use the copied Syncro page snapshot below as the source of truth. ' +
                'Do not invent details that are not present in the snapshot.\n\n';
        }

        output +=
            'MY REQUEST\n';

        output +=
            '==========\n';

        output +=
            `${request}\n`;

        if (includeSnapshot) {
            output += '\n\n';

            output +=
                buildTicketContext();
        }

        return output;
    }

    // ============================================================
    // Copy prompt / open ChatGPT
    // ============================================================

    function validateSources() {
        const useSyncro =
            document.getElementById(
                'tns-gpt-use-syncro'
            )?.checked ?? true;

        const includeSnapshot =
            document.getElementById(
                'tns-gpt-use-snapshot'
            )?.checked ?? true;

        if (
            !useSyncro &&
            !includeSnapshot
        ) {
            setStatus(
                'Enable either @Syncro live data or the page snapshot first.',
                true
            );

            return false;
        }

        return true;
    }

    function copyPrompt(openNewChat) {
        if (!validateSources()) {
            return;
        }

        const prompt =
            buildFullPrompt();

        GM_setClipboard(
            prompt,
            'text'
        );

        if (openNewChat) {
            setStatus(
                'Prompt copied. Opening a clean ChatGPT conversation — paste with Ctrl+V.'
            );

            GM_openInTab(
                CHATGPT_NEW_URL,
                {
                    active: true,
                    insert: true,
                    setParent: true
                }
            );

            return;
        }

        setStatus(
            'Prompt copied to clipboard.'
        );
    }

    // ============================================================
    // Syncro comment editor
    // ============================================================

    function getCommentForm() {
        const forms = [
            ...document.querySelectorAll(
                'form#new_comment'
            )
        ];

        const editorForm =
            forms.find(form => {

                const editor =
                    form.querySelector(
                        '.note-editor, .note-editable'
                    );

                return isVisible(editor);
            });

        if (editorForm) {
            return editorForm;
        }

        const visibleForm =
            forms.find(
                form => isVisible(form)
            );

        return (
            visibleForm ||
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
                    bubbles: true
                }
            )
        );
    }

    async function prepareSyncroNote(type) {
        const isPrivate =
            type === 'internal';

        try {
            selectSyncroNoteType(
                type
            );

            await sleep(900);

            const form =
                getCommentForm();

            if (!form) {
                throw new Error(
                    'Could not find the Syncro comment form.'
                );
            }

            const editor =
                form.querySelector(
                    '.note-editable'
                );

            const editorContainer =
                form.querySelector(
                    '.note-editor'
                );

            if (!editor) {
                throw new Error(
                    'Could not find the Syncro rich-text editor.'
                );
            }

            (
                editorContainer ||
                editor
            ).scrollIntoView({
                behavior: 'smooth',
                block: 'center'
            });

            await sleep(400);

            editor.focus();

            try {
                const range =
                    document.createRange();

                range.selectNodeContents(
                    editor
                );

                range.collapse(false);

                const selection =
                    window.getSelection();

                selection.removeAllRanges();

                selection.addRange(
                    range
                );

            } catch (error) {
                console.warn(
                    'TNS ChatGPT Helper: Could not position caret:',
                    error
                );
            }

            if (isPrivate) {
                setStatus(
                    'PRIVATE NOTE ready — press Ctrl+V to paste the ChatGPT response.'
                );
            } else {
                setStatus(
                    'PUBLIC NOTE ready — press Ctrl+V to paste the ChatGPT response.'
                );
            }

        } catch (error) {
            console.error(
                'TNS ChatGPT Helper:',
                error
            );

            setStatus(
                error.message ||
                'Unable to prepare the Syncro comment editor.',
                true
            );
        }
    }

    // ============================================================
    // Status / preview
    // ============================================================

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
                        'show'
                    );

                    status.classList.remove(
                        'error'
                    );

                },
                6500
            );
    }

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
    }

    function refreshPreview(
        showMessage = true
    ) {
        const preview =
            document.getElementById(
                'tns-gpt-context-preview'
            );

        if (!preview) {
            return;
        }

        const includeSnapshot =
            document.getElementById(
                'tns-gpt-use-snapshot'
            )?.checked ?? true;

        if (!includeSnapshot) {
            preview.textContent =
                'Page snapshot is disabled.\n\n' +
                'ChatGPT will be instructed to retrieve the ticket using @Syncro.';
        } else {
            preview.textContent =
                buildTicketContext();
        }

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

    // ============================================================
    // Build panel
    // ============================================================

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
                    <span class="tns-gpt-icon">
                        ✦
                    </span>

                    <span>
                        ChatGPT
                    </span>
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
                                Copies the ticket from the browser so ChatGPT can continue if @Syncro is unavailable.
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

    // ============================================================
    // Panel events
    // ============================================================

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
                    );
                }
            }
        );

        panel.querySelector(
            '#tns-gpt-new-chat'
        ).addEventListener(
            'click',
            event => {

                event.stopPropagation();

                copyPrompt(true);
            }
        );

        panel.querySelector(
            '#tns-gpt-copy'
        ).addEventListener(
            'click',
            event => {

                event.stopPropagation();

                copyPrompt(false);
            }
        );

        panel.querySelector(
            '#tns-gpt-refresh'
        ).addEventListener(
            'click',
            event => {

                event.stopPropagation();

                refreshPreview(true);
            }
        );

        panel.querySelector(
            '#tns-gpt-ready-public'
        ).addEventListener(
            'click',
            async event => {

                event.stopPropagation();

                await prepareSyncroNote(
                    'external'
                );
            }
        );

        panel.querySelector(
            '#tns-gpt-ready-private'
        ).addEventListener(
            'click',
            async event => {

                event.stopPropagation();

                await prepareSyncroNote(
                    'internal'
                );
            }
        );

        panel.querySelector(
            '#tns-gpt-use-syncro'
        ).addEventListener(
            'change',
            () => {
                refreshPreview(false);
            }
        );

        panel.querySelector(
            '#tns-gpt-use-snapshot'
        ).addEventListener(
            'change',
            () => {
                refreshPreview(false);
            }
        );

        panel.querySelector(
            '#tns-gpt-include-comments'
        ).addEventListener(
            'change',
            () => {

                updateOptionStates();

                refreshPreview(false);
            }
        );

        panel.querySelector(
            '#tns-gpt-include-private'
        ).addEventListener(
            'change',
            () => {
                refreshPreview(false);
            }
        );

        panel.querySelectorAll(
            '[data-prompt]'
        ).forEach(button => {

            button.addEventListener(
                'click',
                () => {

                    const type =
                        button.dataset.prompt;

                    if (
                        type ===
                        'summarize'
                    ) {
                        setQuickPrompt(
                            'Summarize this ticket for me. Explain what has happened so far, the current situation, and anything important I should notice.'
                        );
                    }

                    if (
                        type ===
                        'next'
                    ) {
                        setQuickPrompt(
                            'Review this ticket and tell me the most reasonable next steps. Separate anything that clearly needs action from anything that is informational only.'
                        );
                    }

                    if (
                        type ===
                        'public'
                    ) {
                        setQuickPrompt(
                            'Draft a concise public-facing Syncro ticket note for the customer based on this ticket. Keep it professional and easy to understand. Do not expose private/internal information. Do not post it to Syncro unless I explicitly ask you to.'
                        );
                    }

                    if (
                        type ===
                        'troubleshoot'
                    ) {
                        setQuickPrompt(
                            'Help me troubleshoot this ticket. Based on the available information, identify likely causes, what has already been established, and what I should check next.'
                        );
                    }
                }
            );
        });

        setTimeout(
            () => {

                updateOptionStates();

                refreshPreview(false);

            },
            1000
        );
    }

    // ============================================================
    // Mount panel
    // ============================================================

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

        wirePanel(panel);

        return true;
    }

    // ============================================================
    // Styling
    // ============================================================

    const style =
        document.createElement(
            'style'
        );

    style.textContent = `
        #${PANEL_ID} {
            border: 1px solid #c5c5c5;
            border-radius: 6px;
            overflow: hidden;
            background: #ffffff;
            color: #333333;
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
            opacity: 0.65;
            font-size: 12px;
        }

        #${PANEL_ID} .tns-gpt-chevron {
            font-size: 11px;
            width: 15px;
            text-align: center;
        }

        #${PANEL_ID} .tns-gpt-body {
            padding: 16px 18px 18px 18px;
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
            box-sizing: border-box;
            resize: vertical;
            border: 1px solid #aaaaaa;
            border-radius: 4px;
            padding: 10px;
            font: inherit;
            background: #ffffff;
            color: #333333;
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

        #${PANEL_ID} .tns-gpt-return-description {
            margin-bottom: 10px;
            opacity: 0.8;
            font-size: 13px;
        }

        #${PANEL_ID} .tns-gpt-safe-note {
            margin-top: 9px;
            font-size: 12px;
            opacity: 0.7;
            line-height: 1.4;
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
            opacity: 0.7;
            margin-top: 2px;
            line-height: 1.35;
        }

        #${PANEL_ID} .tns-gpt-options {
            display: flex;
            flex-wrap: wrap;
            gap: 20px;
            margin-top: 14px;
            margin-bottom: 14px;
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
            user-select: none;
            font-weight: 600;
        }

        #${PANEL_ID} #tns-gpt-context-preview {
            margin-top: 10px;
            margin-bottom: 0;
            padding: 12px;
            max-height: 300px;
            overflow: auto;
            white-space: pre-wrap;
            word-break: break-word;
            border: 1px solid #cccccc;
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

        #${PANEL_ID} #tns-gpt-status {
            height: 0;
            opacity: 0;
            overflow: hidden;
            transition: opacity 0.2s ease;
            font-size: 12px;
        }

        #${PANEL_ID} #tns-gpt-status.show {
            height: auto;
            opacity: 0.9;
            margin-top: 10px;
        }

        #${PANEL_ID} #tns-gpt-status.error {
            color: #e45d5d;
            opacity: 1;
        }

        /*
         * Syncro dark mode
         */
        body.dark #${PANEL_ID} {
            background: #202020;
            border-color: #575757;
            color: #dddddd;
        }

        body.dark #${PANEL_ID} .tns-gpt-header {
            background: #343434;
        }

        body.dark #${PANEL_ID} .tns-gpt-body {
            border-top-color: #575757;
        }

        body.dark #${PANEL_ID} .tns-gpt-textarea {
            background: #1c1c1c;
            color: #eeeeee;
            border-color: #555555;
        }

        body.dark #${PANEL_ID} .tns-gpt-textarea::placeholder {
            color: #888888;
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

    // ============================================================
    // Initial mount + Syncro rerender protection
    // ============================================================

    mountPanel();

    let mountTimer = null;

    const observer =
        new MutationObserver(() => {

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
        });

    observer.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );

})();
