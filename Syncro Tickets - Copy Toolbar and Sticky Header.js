// ==UserScript==
// @name         Syncro Tickets - Copy Toolbar and Sticky Header
// @namespace    https://texomans.com/
// @version      1.0.8
// @description  Syncro-styled ticket copy tools plus a solid responsive fixed ticket header that respects Guided Resolution and disables sticky mode on mobile.
// @match        https://*.syncromsp.com/tickets/*
// @updateURL    https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Tickets%20-%20Copy%20Toolbar%20and%20Sticky%20Header.js
// @downloadURL  https://raw.githubusercontent.com/texomans/Syncro-TamperMonkey/main/Syncro%20Tickets%20-%20Copy%20Toolbar%20and%20Sticky%20Header.js
// @run-at       document-idle
// @grant        GM_setClipboard
// ==/UserScript==

(function () {
  'use strict';

  const TOOLBAR_ID = 'tns-ticket-copy-toolbar';
  const STATUS_ID = 'tns-ticket-copy-status';
  const STYLE_ID = 'tns-ticket-copy-sticky-style';
  const SPACER_ID = 'tns-ticket-sticky-header-spacer';

  /*
   * Sticky header is disabled at this width and below.
   * Copy tools remain available.
   */
  const MOBILE_BREAKPOINT = 900;

  /*
   * Re-check the ticket-content width ten times per second.
   *
   * This keeps the fixed header synchronized with
   * Guided Resolution opening/closing.
   */
  const POLL_MS = 100;

  let stickyRowsCache = null;
  let stickyNavEls = null;
  let stickyPollTimer = null;
  let stickyLayoutRaf = 0;
  let stickyEnabled = false;

  // ============================================================
  // General helpers
  // ============================================================

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function cleanMultiline(value) {
    return String(value || '')
      .replace(/\r/g, '')
      .split('\n')
      .map(line => cleanText(line))
      .filter(Boolean)
      .join('\n');
  }

  function textOf(element) {
    return element
      ? cleanText(element.textContent)
      : '';
  }

  function multilineTextOf(element) {
    if (!element) {
      return '';
    }

    const clone =
      element.cloneNode(true);

    clone
      .querySelectorAll('br')
      .forEach(br => {
        br.replaceWith('\n');
      });

    return cleanMultiline(
      clone.textContent
    );
  }

  function getTicketIdFromPath() {
    const match =
      location.pathname.match(
        /\/tickets\/(\d+)/i
      );

    return match
      ? match[1]
      : '';
  }

  function isMobileLayout() {
    return window.matchMedia(
      `(max-width: ${MOBILE_BREAKPOINT}px)`
    ).matches;
  }

  // ============================================================
  // Syncro widget / field helpers
  // ============================================================

  function getWidgetByHeader(
    headerText
  ) {
    const wanted =
      cleanText(
        headerText
      ).toLowerCase();

    const headers =
      document.querySelectorAll(
        '.widget-header h3, .widget-header h2'
      );

    for (
      const header
      of headers
    ) {
      if (
        textOf(header)
          .toLowerCase() !==
        wanted
      ) {
        continue;
      }

      const widget =
        header.closest(
          '.widget'
        );

      if (widget) {
        return widget;
      }
    }

    return null;
  }

  function findWidgetRow(
    widgetName,
    labels
  ) {
    const widget =
      getWidgetByHeader(
        widgetName
      );

    if (!widget) {
      return null;
    }

    const wanted =
      labels.map(label =>
        cleanText(label)
          .toLowerCase()
      );

    for (
      const header
      of widget.querySelectorAll(
        'th'
      )
    ) {
      const label =
        textOf(header)
          .replace(/:$/, '')
          .trim()
          .toLowerCase();

      if (
        !wanted.includes(label)
      ) {
        continue;
      }

      const row =
        header.closest('tr');

      if (row) {
        return row;
      }
    }

    return null;
  }

  function getWidgetField(
    widgetName,
    labels
  ) {
    const row =
      findWidgetRow(
        widgetName,
        labels
      );

    if (!row) {
      return '';
    }

    const headers =
      row.querySelectorAll(
        'th'
      );

    const lastHeader =
      headers[
        headers.length - 1
      ];

    const cell =
      lastHeader
        ? lastHeader
            .nextElementSibling
        : row.querySelector(
            'td'
          );

    if (!cell) {
      return '';
    }

    /*
     * Syncro often stores the full value
     * in data-original-title.
     */
    const tooltip =
      cell.querySelector(
        '[data-original-title]'
      );

    const tooltipValue =
      cleanText(
        tooltip?.getAttribute(
          'data-original-title'
        )
      );

    if (tooltipValue) {
      return tooltipValue;
    }

    return textOf(cell);
  }

  // ============================================================
  // Ticket data
  // ============================================================

  function getTicketNumber() {
    const heading =
      document.querySelector(
        '.rs2-ticket-main h1'
      ) ||
      document.querySelector(
        'h1'
      );

    const match =
      textOf(heading).match(
        /#\s*(\d+)/
      );

    return match
      ? match[1]
      : getTicketIdFromPath();
  }

  function getTicketSubject() {
    const input =
      document.querySelector(
        '#ticket-subject'
      );

    if (
      input &&
      cleanText(input.value)
    ) {
      return cleanText(
        input.value
      );
    }

    const subject =
      document.querySelector(
        '.ticket-subject-title'
      );

    if (
      subject &&
      cleanText(
        subject.textContent
      )
    ) {
      return cleanText(
        subject.textContent
      );
    }

    const reactSubject =
      document.querySelector(
        '[data-sidepack-react-class="tickets/SubjectEditing"]'
      );

    if (reactSubject) {
      try {
        const props =
          JSON.parse(
            reactSubject.getAttribute(
              'data-react-props'
            ) || '{}'
          );

        if (
          cleanText(
            props.ticketSubject
          )
        ) {
          return cleanText(
            props.ticketSubject
          );
        }
      } catch (_) {
        // Ignore malformed props.
      }
    }

    return '';
  }

  function getTicketStatus() {
    const select =
      document.querySelector(
        '#ticket_status'
      );

    if (
      select?.selectedOptions
        ?.length
    ) {
      const value =
        textOf(
          select
            .selectedOptions[0]
        );

      if (value) {
        return value;
      }
    }

    return getWidgetField(
      'Ticket Info',
      ['Status']
    );
  }

  function getAssignee() {
    const editor =
      document.querySelector(
        '[data-sidepack-react-class="tickets/TechEditing"]'
      );

    if (editor) {
      try {
        const props =
          JSON.parse(
            editor.getAttribute(
              'data-react-props'
            ) || '{}'
          );

        const options =
          Array.isArray(
            props.assigneeOptions
          )
            ? props.assigneeOptions
            : [];

        const current =
          options.find(
            item =>
              String(item.id) ===
              String(
                props.initialUserId
              )
          );

        if (current?.name) {
          return cleanText(
            current.name
          );
        }
      } catch (_) {
        // Fall through.
      }
    }

    return getWidgetField(
      'Ticket Info',
      [
        'Assignee',
        'Assigned To'
      ]
    );
  }

  function getCreated() {
    return getWidgetField(
      'Ticket Info',
      ['Created']
    );
  }

  function getDue() {
    const due =
      document.querySelector(
        'a.bhv-DueDateEdit'
      );

    if (due) {
      return cleanText(
        due.getAttribute(
          'data-title'
        ) ||
        due.getAttribute(
          'data-original-title'
        ) ||
        due.getAttribute(
          'title'
        ) ||
        textOf(due)
      );
    }

    return getWidgetField(
      'Ticket Info',
      [
        'Due Date',
        'Due'
      ]
    );
  }

  function getCustomerName() {
    return getWidgetField(
      'Customer Info',
      ['Customer']
    );
  }

  function getContactName() {
    return getWidgetField(
      'Customer Info',
      [
        'Assigned Contact',
        'Primary Contact',
        'Contact'
      ]
    );
  }

  function getEmail() {
    return getWidgetField(
      'Customer Info',
      [
        'Email',
        'Contact Email'
      ]
    );
  }

  function getPhone() {
    return getWidgetField(
      'Customer Info',
      [
        'Contact Phone',
        'Phone'
      ]
    );
  }

  function getMobile() {
    return getWidgetField(
      'Customer Info',
      [
        'Contact Mobile',
        'Mobile'
      ]
    );
  }

  // ============================================================
  // Address
  // ============================================================

  function getPrimaryAddress() {
    const row =
      findWidgetRow(
        'Customer Info',
        [
          'Primary Address',
          'Address'
        ]
      );

    if (!row) {
      return '';
    }

    /*
     * Prefer the actual Google Maps
     * address text Syncro renders.
     */
    const mapLink =
      row.querySelector(
        'td a[href*="maps.google.com"], ' +
        'td a[href*="google.com/maps"]'
      );

    if (mapLink) {
      const value =
        multilineTextOf(
          mapLink
        );

      if (value) {
        return value;
      }
    }

    const headers =
      row.querySelectorAll(
        'th'
      );

    const lastHeader =
      headers[
        headers.length - 1
      ];

    const cell =
      lastHeader
        ? lastHeader
            .nextElementSibling
        : row.querySelector(
            'td'
          );

    return multilineTextOf(
      cell
    );
  }

  function getAddress() {
    const ticketRow =
      findWidgetRow(
        'Customer Info',
        ['Ticket Address']
      );

    /*
     * If Syncro ever renders an actual
     * address/map link here, use it.
     */
    if (ticketRow) {
      const mapLink =
        ticketRow.querySelector(
          'td a[href*="maps.google.com"], ' +
          'td a[href*="google.com/maps"]'
        );

      if (mapLink) {
        const value =
          multilineTextOf(
            mapLink
          );

        if (value) {
          return value;
        }
      }
    }

    /*
     * Ticket Address is normally only
     * a location label such as:
     *
     * Customer Address
     *
     * Copy the actual address instead.
     */
    return getPrimaryAddress();
  }

  // ============================================================
  // Copy text builders
  // ============================================================

  function buildTicketReference() {
    const number =
      getTicketNumber();

    const subject =
      getTicketSubject();

    const title = [
      number
        ? '#' + number
        : '',
      subject
    ]
      .filter(Boolean)
      .join(' - ');

    return [
      title,
      location.href
    ]
      .filter(Boolean)
      .join('\n');
  }

  function buildFormattedDetails() {
    const rows = [
      [
        'Ticket',
        getTicketNumber()
          ? '#' +
            getTicketNumber()
          : ''
      ],
      [
        'Subject',
        getTicketSubject()
      ],
      [
        'Status',
        getTicketStatus()
      ],
      [
        'Assignee',
        getAssignee()
      ],
      [
        'Customer',
        getCustomerName()
      ],
      [
        'Contact',
        getContactName()
      ],
      [
        'Phone',
        getPhone()
      ],
      [
        'Mobile',
        getMobile()
      ],
      [
        'Email',
        getEmail()
      ],
      [
        'Address',
        getAddress()
      ],
      [
        'Created',
        getCreated()
      ],
      [
        'Due',
        getDue()
      ],
      [
        'URL',
        location.href
      ]
    ];

    return rows
      .filter(
        ([, value]) =>
          cleanText(value)
      )
      .map(
        ([label, value]) =>
          label +
          ': ' +
          String(value).trim()
      )
      .join('\n');
  }

  // ============================================================
  // Clipboard
  // ============================================================

  async function copyText(
    value,
    label,
    sourceButton
  ) {
    const text =
      String(value || '')
        .trim();

    if (!cleanText(text)) {
      showStatus(
        'Nothing found to copy',
        false
      );

      flashButton(
        sourceButton,
        false
      );

      return;
    }

    let copied =
      false;

    try {
      if (
        typeof GM_setClipboard ===
        'function'
      ) {
        GM_setClipboard(
          text,
          'text'
        );

        copied =
          true;
      }
    } catch (_) {
      // Fall through.
    }

    if (!copied) {
      try {
        await navigator
          .clipboard
          .writeText(
            text
          );

        copied =
          true;
      } catch (_) {
        try {
          const textarea =
            document.createElement(
              'textarea'
            );

          textarea.value =
            text;

          textarea.setAttribute(
            'readonly',
            ''
          );

          textarea.style.position =
            'fixed';

          textarea.style.left =
            '-9999px';

          textarea.style.top =
            '-9999px';

          document.body.appendChild(
            textarea
          );

          textarea.focus();
          textarea.select();

          copied =
            document.execCommand(
              'copy'
            );

          textarea.remove();
        } catch (_) {
          copied =
            false;
        }
      }
    }

    showStatus(
      copied
        ? 'Copied ' + label
        : 'Copy failed',
      copied
    );

    flashButton(
      sourceButton,
      copied
    );
  }

  function flashButton(
    button,
    success
  ) {
    if (!button) {
      return;
    }

    const hadDefault =
      button.classList.contains(
        'btn-default'
      );

    button.classList.remove(
      'btn-default',
      'btn-success',
      'btn-danger'
    );

    button.classList.add(
      success
        ? 'btn-success'
        : 'btn-danger'
    );

    setTimeout(() => {
      button.classList.remove(
        'btn-success',
        'btn-danger'
      );

      if (hadDefault) {
        button.classList.add(
          'btn-default'
        );
      }
    }, 650);
  }

  function showStatus(
    message,
    success
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
      'tns-copy-status-error',
      !success
    );

    status.classList.add(
      'tns-copy-status-visible'
    );

    clearTimeout(
      showStatus.timer
    );

    showStatus.timer =
      setTimeout(() => {
        status.classList.remove(
          'tns-copy-status-visible'
        );
      }, 1600);
  }

  // ============================================================
  // Copy toolbar
  // ============================================================

  function makeButton(
    label,
    title
  ) {
    const button =
      document.createElement(
        'button'
      );

    button.type =
      'button';

    button.className =
      'btn btn-default btn-sm';

    button.textContent =
      label;

    button.title =
      title;

    return button;
  }

  function closeCopyMenus() {
    document
      .querySelectorAll(
        '.tns-ticket-copy-more.open'
      )
      .forEach(group => {
        group.classList.remove(
          'open'
        );

        const button =
          group.querySelector(
            '.dropdown-toggle'
          );

        if (button) {
          button.setAttribute(
            'aria-expanded',
            'false'
          );
        }
      });
  }

  function createToolbar() {
    const toolbar =
      document.createElement(
        'div'
      );

    toolbar.id =
      TOOLBAR_ID;

    toolbar.className =
      'tns-ticket-copy-toolbar';

    const buttonGroup =
      document.createElement(
        'div'
      );

    buttonGroup.className =
      'btn-group';

    buttonGroup.setAttribute(
      'role',
      'group'
    );

    buttonGroup.setAttribute(
      'aria-label',
      'Ticket copy tools'
    );

    const urlButton =
      makeButton(
        'Copy URL',
        'Copy ticket URL'
      );

    urlButton.dataset.copyAction =
      'url';

    const ticketButton =
      makeButton(
        'Copy Ticket',
        'Copy ticket number, subject, and URL'
      );

    ticketButton.dataset.copyAction =
      'ticket';

    const detailsButton =
      makeButton(
        'Copy Details',
        'Copy formatted ticket details'
      );

    detailsButton.dataset.copyAction =
      'details';

    const moreGroup =
      document.createElement(
        'div'
      );

    moreGroup.className =
      'btn-group tns-ticket-copy-more';

    const moreButton =
      document.createElement(
        'button'
      );

    moreButton.type =
      'button';

    moreButton.className =
      'btn btn-default btn-sm dropdown-toggle';

    moreButton.setAttribute(
      'aria-haspopup',
      'true'
    );

    moreButton.setAttribute(
      'aria-expanded',
      'false'
    );

    moreButton.innerHTML =
      'Copy <span class="caret"></span>';

    const menu =
      document.createElement(
        'ul'
      );

    menu.className =
      'dropdown-menu';

    menu.setAttribute(
      'role',
      'menu'
    );

    [
      [
        'Customer',
        'customer'
      ],
      [
        'Contact',
        'contact'
      ],
      [
        'Phone',
        'phone'
      ],
      [
        'Mobile',
        'mobile'
      ],
      [
        'Email',
        'email'
      ],
      [
        'Address',
        'address'
      ]
    ].forEach(
      ([
        label,
        action
      ]) => {
        const item =
          document.createElement(
            'li'
          );

        const link =
          document.createElement(
            'a'
          );

        link.href =
          '#';

        link.dataset.copyAction =
          action;

        link.textContent =
          label;

        item.appendChild(
          link
        );

        menu.appendChild(
          item
        );
      }
    );

    moreGroup.append(
      moreButton,
      menu
    );

    const status =
      document.createElement(
        'span'
      );

    status.id =
      STATUS_ID;

    status.className =
      'tns-ticket-copy-status';

    status.setAttribute(
      'aria-live',
      'polite'
    );

    buttonGroup.append(
      urlButton,
      ticketButton,
      detailsButton,
      moreGroup
    );

    toolbar.append(
      buttonGroup,
      status
    );

    moreButton.addEventListener(
      'click',
      event => {
        event.preventDefault();
        event.stopPropagation();

        const opening =
          !moreGroup
            .classList
            .contains(
              'open'
            );

        closeCopyMenus();

        moreGroup.classList.toggle(
          'open',
          opening
        );

        moreButton.setAttribute(
          'aria-expanded',
          opening
            ? 'true'
            : 'false'
        );
      }
    );

    toolbar.addEventListener(
      'click',
      async event => {
        const target =
          event.target.closest(
            '[data-copy-action]'
          );

        if (!target) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();

        closeCopyMenus();

        switch (
          target.dataset.copyAction
        ) {
          case 'url':
            await copyText(
              location.href,
              'URL',
              urlButton
            );
            break;

          case 'ticket':
            await copyText(
              buildTicketReference(),
              'ticket',
              ticketButton
            );
            break;

          case 'details':
            await copyText(
              buildFormattedDetails(),
              'details',
              detailsButton
            );
            break;

          case 'customer':
            await copyText(
              getCustomerName(),
              'customer',
              moreButton
            );
            break;

          case 'contact':
            await copyText(
              getContactName(),
              'contact',
              moreButton
            );
            break;

          case 'phone':
            await copyText(
              getPhone(),
              'phone',
              moreButton
            );
            break;

          case 'mobile':
            await copyText(
              getMobile(),
              'mobile',
              moreButton
            );
            break;

          case 'email':
            await copyText(
              getEmail(),
              'email',
              moreButton
            );
            break;

          case 'address':
            await copyText(
              getAddress(),
              'address',
              moreButton
            );
            break;
        }
      }
    );

    return toolbar;
  }

  function ensureToolbar() {
    if (
      document.getElementById(
        TOOLBAR_ID
      )
    ) {
      return true;
    }

    const actionBar =
      document.querySelector(
        '.title-btns'
      ) ||
      document.querySelector(
        '.btn-bar'
      );

    if (!actionBar) {
      return false;
    }

    actionBar.insertBefore(
      createToolbar(),
      actionBar.firstChild
    );

    return true;
  }

  // ============================================================
  // Sticky header helpers
  // ============================================================

  /*
   * Starting from something inside the normal ticket body,
   * walk upward until we reach a direct child of
   * .rs2-ticket-main--uncapped.
   */
  function findDirectMainChild(
    element,
    mainInner
  ) {
    let current =
      element;

    while (
      current &&
      current.parentElement !==
      mainInner
    ) {
      current =
        current.parentElement;
    }

    return (
      current &&
      current.parentElement ===
      mainInner
    )
      ? current
      : null;
  }

  /*
   * Measure a normal ticket-content row rather than
   * the fixed header itself.
   *
   * This lets the header track Guided Resolution
   * opening and closing.
   */
  function findResponsiveWidthAnchor(
    mainInner
  ) {
    if (!mainInner) {
      return null;
    }

    const progressTab =
      mainInner.querySelector(
        '.progress-tab'
      );

    if (!progressTab) {
      return mainInner;
    }

    const directChild =
      findDirectMainChild(
        progressTab,
        mainInner
      );

    if (!directChild) {
      return mainInner;
    }

    return (
      directChild.querySelector(
        ':scope > .col-md-12'
      ) ||
      directChild
    );
  }

  function getStickyHeaderRows() {
    const backRow =
      document.querySelector(
        '.back-button-container'
      );

    if (!backRow) {
      return null;
    }

    /*
     * Syncro structure:
     *
     * Back
     * Ticket # / actions
     * Subject
     */
    let titleRow =
      backRow.nextElementSibling;

    if (
      !titleRow ||
      !titleRow.classList ||
      !titleRow.classList.contains(
        'row'
      )
    ) {
      const heading =
        backRow.parentElement
          ? backRow
              .parentElement
              .querySelector(
                '.row h1'
              )
          : null;

      titleRow =
        heading
          ? heading.closest(
              '.row'
            )
          : null;
    }

    const subjectRow =
      document.querySelector(
        '.row.mts.mbm'
      );

    const container =
      backRow.closest(
        '.col-md-12'
      ) ||
      backRow.parentElement;

    const mainPane =
      document.querySelector(
        '.rs2-ticket-main'
      );

    const mainInner =
      document.querySelector(
        '.rs2-ticket-main--uncapped'
      );

    const widthAnchor =
      findResponsiveWidthAnchor(
        mainInner
      );

    return {
      backRow,
      titleRow,
      subjectRow,
      container,
      mainPane,
      mainInner,
      widthAnchor,
      geometry: null
    };
  }

  // ============================================================
  // Navigation height
  // ============================================================

  function calcTopOffset() {
    if (!stickyNavEls) {
      const found = [
        'nav.main-navbar',
        'nav.sub-navbar',
        '#section_header',
        'nav.navbar'
      ]
        .map(selector =>
          document.querySelector(
            selector
          )
        )
        .filter(Boolean);

      if (found.length) {
        stickyNavEls =
          found;
      }
    }

    if (!stickyNavEls) {
      return 0;
    }

    let maxBottom =
      0;

    for (
      const element
      of stickyNavEls
    ) {
      const rect =
        element.getBoundingClientRect();

      if (
        rect.height > 0 &&
        rect.bottom >
        maxBottom
      ) {
        maxBottom =
          rect.bottom;
      }
    }

    return Math.max(
      0,
      maxBottom
    );
  }

  // ============================================================
  // Match Syncro's background
  // ============================================================

  function isOpaqueColor(
    value
  ) {
    if (
      !value ||
      value === 'transparent'
    ) {
      return false;
    }

    const match =
      value.match(
        /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+(?:\s*,\s*([\d.]+))?\s*\)$/i
      );

    if (!match) {
      return true;
    }

    if (
      typeof match[1] ===
      'undefined'
    ) {
      return true;
    }

    return (
      Number(match[1]) >
      0.01
    );
  }

  function getSolidBackground(
    startElement
  ) {
    let element =
      startElement;

    while (
      element &&
      element !==
      document.documentElement
    ) {
      const background =
        getComputedStyle(
          element
        ).backgroundColor;

      if (
        isOpaqueColor(
          background
        )
      ) {
        return background;
      }

      element =
        element.parentElement;
    }

    const bodyBackground =
      getComputedStyle(
        document.body
      ).backgroundColor;

    return isOpaqueColor(
      bodyBackground
    )
      ? bodyBackground
      : '#1f1f1f';
  }

  function updateStickyBackground(
    parts
  ) {
    const background =
      getSolidBackground(
        parts.mainInner ||
        parts.container ||
        document.body
      );

    document.documentElement
      .style
      .setProperty(
        '--tns-ticket-sticky-bg',
        background
      );
  }

  // ============================================================
  // Responsive horizontal sizing
  // ============================================================

  function getResponsiveBounds(
    parts
  ) {
    const anchor =
      parts.widthAnchor ||
      parts.mainInner ||
      parts.mainPane;

    const rect =
      anchor
        .getBoundingClientRect();

    return {
      left:
        rect.left,

      right:
        rect.right,

      width:
        Math.max(
          0,
          rect.width
        )
    };
  }

  /*
   * Capture how Syncro normally positions each row
   * relative to the responsive ticket-content area.
   *
   * This is always done while the rows are in their
   * normal, non-fixed Syncro layout.
   */
  function captureNaturalGeometry(
    parts
  ) {
    const bounds =
      getResponsiveBounds(
        parts
      );

    function capture(row) {
      if (!row) {
        return null;
      }

      const rect =
        row
          .getBoundingClientRect();

      return {
        leftInset:
          rect.left -
          bounds.left,

        rightInset:
          bounds.right -
          rect.right
      };
    }

    parts.geometry = {
      backRow:
        capture(
          parts.backRow
        ),

      titleRow:
        capture(
          parts.titleRow
        ),

      subjectRow:
        capture(
          parts.subjectRow
        )
    };
  }

  function setPxStyle(
    element,
    property,
    value
  ) {
    const px =
      Math.round(value) +
      'px';

    if (
      element.style
        .getPropertyValue(
          property
        ) !== px
    ) {
      element.style
        .setProperty(
          property,
          px
        );
    }
  }

  function clearStickyInlineStyles(
    row
  ) {
    if (!row) {
      return;
    }

    row.style.removeProperty(
      'top'
    );

    row.style.removeProperty(
      'left'
    );

    row.style.removeProperty(
      'width'
    );

    row.style.removeProperty(
      'right'
    );
  }

  function getSpacer() {
    return document.getElementById(
      SPACER_ID
    );
  }

  // ============================================================
  // Enable / disable sticky mode
  // ============================================================

  function disableStickyHeader(
    parts
  ) {
    if (!parts) {
      return;
    }

    parts.backRow
      .classList.remove(
        'tns-sticky-row',
        'tns-sticky-back-row'
      );

    parts.titleRow
      .classList.remove(
        'tns-sticky-row',
        'tns-sticky-title-row'
      );

    if (
      parts.subjectRow
    ) {
      parts.subjectRow
        .classList.remove(
          'tns-sticky-row',
          'tns-sticky-subject-row'
        );
    }

    /*
     * Remove our fixed positioning completely.
     * Syncro returns to its normal native layout.
     */
    clearStickyInlineStyles(
      parts.backRow
    );

    clearStickyInlineStyles(
      parts.titleRow
    );

    clearStickyInlineStyles(
      parts.subjectRow
    );

    /*
     * Fixed rows no longer need replacement
     * document-flow height on mobile.
     */
    const spacer =
      getSpacer();

    if (spacer) {
      spacer.style.height =
        '0px';

      spacer.style.display =
        'none';
    }

    stickyEnabled =
      false;
  }

  function enableStickyHeader(
    parts
  ) {
    if (
      !parts ||
      stickyEnabled ||
      isMobileLayout()
    ) {
      return;
    }

    /*
     * If the browser was previously in mobile mode,
     * the header is currently back in Syncro's normal
     * document flow.
     *
     * Recapture its natural geometry before fixing it.
     */
    parts.widthAnchor =
      findResponsiveWidthAnchor(
        parts.mainInner
      ) ||
      parts.widthAnchor;

    captureNaturalGeometry(
      parts
    );

    updateStickyBackground(
      parts
    );

    parts.backRow
      .classList.add(
        'tns-sticky-row',
        'tns-sticky-back-row'
      );

    parts.titleRow
      .classList.add(
        'tns-sticky-row',
        'tns-sticky-title-row'
      );

    if (
      parts.subjectRow
    ) {
      parts.subjectRow
        .classList.add(
          'tns-sticky-row',
          'tns-sticky-subject-row'
        );
    }

    const spacer =
      getSpacer();

    if (spacer) {
      spacer.style.display =
        'block';
    }

    stickyEnabled =
      true;
  }

  function placeRow(
    row,
    geometry,
    topPx,
    bounds
  ) {
    if (
      !row ||
      !geometry
    ) {
      return 0;
    }

    const left =
      bounds.left +
      geometry.leftInset;

    const right =
      bounds.right -
      geometry.rightInset;

    const width =
      Math.max(
        0,
        right - left
      );

    setPxStyle(
      row,
      'top',
      topPx
    );

    setPxStyle(
      row,
      'left',
      left
    );

    setPxStyle(
      row,
      'width',
      width
    );

    row.style.right =
      'auto';

    return row
      .getBoundingClientRect()
      .height;
  }

  // ============================================================
  // Apply sticky layout
  // ============================================================

  function applyStickyLayout() {
    const parts =
      stickyRowsCache;

    if (!parts) {
      return;
    }

    /*
     * MOBILE
     *
     * Leave Syncro's ticket header completely native.
     *
     * The copy toolbar still exists and still works,
     * but Back / Ticket # / Actions / Subject scroll
     * normally with the ticket page.
     */
    if (isMobileLayout()) {
      if (stickyEnabled) {
        disableStickyHeader(
          parts
        );
      }

      return;
    }

    /*
     * DESKTOP / TABLET
     *
     * If we just came back from mobile size,
     * turn sticky mode back on and recalculate
     * its natural geometry.
     */
    if (!stickyEnabled) {
      enableStickyHeader(
        parts
      );
    }

    if (
      !stickyEnabled ||
      !parts.geometry
    ) {
      return;
    }

    const bounds =
      getResponsiveBounds(
        parts
      );

    if (!bounds.width) {
      return;
    }

    /*
     * Also follows Syncro light/dark-theme changes.
     */
    updateStickyBackground(
      parts
    );

    const navBottom =
      calcTopOffset();

    let top =
      navBottom;

    /*
     * Fixed stack:
     *
     * Back
     * Ticket # / controls
     * Subject
     */
    top += placeRow(
      parts.backRow,
      parts.geometry.backRow,
      top,
      bounds
    );

    top += placeRow(
      parts.titleRow,
      parts.geometry.titleRow,
      top,
      bounds
    );

    if (
      parts.subjectRow
    ) {
      top += placeRow(
        parts.subjectRow,
        parts.geometry.subjectRow,
        top,
        bounds
      );
    }

    const spacer =
      getSpacer();

    if (spacer) {
      spacer.style.display =
        'block';

      setPxStyle(
        spacer,
        'height',
        Math.ceil(
          top -
          navBottom +
          8
        )
      );
    }
  }

  function scheduleStickyLayout() {
    if (
      stickyLayoutRaf
    ) {
      return;
    }

    stickyLayoutRaf =
      requestAnimationFrame(
        () => {
          stickyLayoutRaf =
            0;

          applyStickyLayout();
        }
      );
  }

  // ============================================================
  // Responsive polling
  // ============================================================

  function startResponsivePolling() {
    if (
      stickyPollTimer
    ) {
      return;
    }

    /*
     * Polling makes this insensitive to whatever
     * internal classes Syncro uses when Guided
     * Resolution opens/closes.
     *
     * It also detects moving across the 900px
     * mobile breakpoint.
     */
    stickyPollTimer =
      setInterval(
        scheduleStickyLayout,
        POLL_MS
      );

    window.addEventListener(
      'resize',
      scheduleStickyLayout,
      {
        passive: true
      }
    );
  }

  // ============================================================
  // Sticky setup
  // ============================================================

  function ensureStickyTicketHeaderRows() {
    /*
     * Already initialized.
     */
    if (
      stickyRowsCache &&
      document.contains(
        stickyRowsCache
          .backRow
      )
    ) {
      scheduleStickyLayout();

      return true;
    }

    stickyRowsCache =
      null;

    stickyEnabled =
      false;

    const parts =
      getStickyHeaderRows();

    if (
      !parts ||
      !parts.backRow ||
      !parts.titleRow ||
      !parts.container ||
      !parts.mainPane ||
      !parts.widthAnchor
    ) {
      return false;
    }

    stickyRowsCache =
      parts;

    /*
     * Create the spacer once.
     *
     * Desktop sticky mode uses it.
     * Mobile mode hides it.
     */
    let spacer =
      getSpacer();

    if (!spacer) {
      spacer =
        document.createElement(
          'div'
        );

      spacer.id =
        SPACER_ID;

      const afterNode =
        parts.subjectRow ||
        parts.titleRow;

      if (
        afterNode?.parentNode
      ) {
        if (
          afterNode.nextSibling
        ) {
          afterNode
            .parentNode
            .insertBefore(
              spacer,
              afterNode
                .nextSibling
            );
        } else {
          afterNode
            .parentNode
            .appendChild(
              spacer
            );
        }
      }
    }

    /*
     * Begin in a neutral state.
     *
     * applyStickyLayout() decides whether
     * sticky should actually be enabled.
     */
    spacer.style.display =
      'none';

    spacer.style.height =
      '0px';

    startResponsivePolling();

    applyStickyLayout();

    return true;
  }

  // ============================================================
  // CSS
  // ============================================================

  function injectStyles() {
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
      /* ========================================================
       * Copy toolbar
       * ======================================================== */

      #${TOOLBAR_ID}.tns-ticket-copy-toolbar {
        display: inline-flex;
        align-items: center;
        flex-wrap: nowrap;
        margin-right: 8px;
        vertical-align: middle;
      }

      #${TOOLBAR_ID} > .btn-group > .btn,
      #${TOOLBAR_ID} > .btn-group > .btn-group > .btn {
        white-space: nowrap;
      }

      #${TOOLBAR_ID} .tns-ticket-copy-more {
        position: relative;
      }

      #${TOOLBAR_ID} .dropdown-menu {
        min-width: 150px;
        left: auto;
        right: 0;
        z-index: 1065;
      }

      #${TOOLBAR_ID} .tns-ticket-copy-status {
        display: inline-block;
        align-self: center;
        max-width: 0;
        margin-left: 0;
        overflow: hidden;
        opacity: 0;
        white-space: nowrap;
        font-size: 12px;
        font-weight: 600;

        transition:
          max-width .18s ease,
          opacity .18s ease,
          margin-left .18s ease;
      }

      #${TOOLBAR_ID} .tns-ticket-copy-status-visible {
        max-width: 180px;
        margin-left: 8px;
        opacity: 1;
      }

      #${TOOLBAR_ID} .tns-copy-status-error {
        color: #a94442;
      }

      /* ========================================================
       * Fixed ticket header
       *
       * These classes are never present on mobile.
       * ======================================================== */

      .tns-sticky-row {
        position: fixed !important;

        z-index:
          10 !important;

        box-sizing:
          border-box !important;

        /*
         * Bootstrap .row normally uses
         * negative horizontal margins.
         *
         * Fixed rows already receive exact
         * left/width values from JS.
         */
        margin-left:
          0 !important;

        margin-right:
          0 !important;

        margin-top:
          0 !important;

        margin-bottom:
          0 !important;

        /*
         * Match Syncro's ticket-area background.
         */
        background:
          var(
            --tns-ticket-sticky-bg,
            #1f1f1f
          ) !important;

        background-color:
          var(
            --tns-ticket-sticky-bg,
            #1f1f1f
          ) !important;

        border:
          0 !important;

        box-shadow:
          none !important;
      }

      .tns-sticky-back-row {
        z-index:
          11 !important;
      }

      /*
       * Use available width efficiently when
       * Guided Resolution is open.
       */
      .tns-sticky-title-row {
        z-index:
          12 !important;

        display:
          flex !important;

        align-items:
          center !important;

        flex-wrap:
          nowrap !important;
      }

      /*
       * Ticket number only consumes what it needs.
       */
      .tns-sticky-title-row > .col-md-4 {
        float:
          none !important;

        width:
          auto !important;

        flex:
          0 0 auto !important;

        min-width:
          110px;
      }

      /*
       * Buttons receive the rest of the row.
       *
       * They can wrap when Guided Resolution
       * genuinely makes the pane too narrow,
       * then automatically unwrap when it closes.
       */
      .tns-sticky-title-row > .title-btns,
      .tns-sticky-title-row > .btn-bar {
        float:
          none !important;

        width:
          auto !important;

        min-width:
          0 !important;

        flex:
          1 1 auto !important;

        display:
          flex !important;

        align-items:
          center !important;

        justify-content:
          flex-end !important;

        flex-wrap:
          wrap !important;

        column-gap:
          8px;

        row-gap:
          4px;
      }

      .tns-sticky-title-row > .title-btns > *,
      .tns-sticky-title-row > .btn-bar > * {
        float:
          none !important;

        flex:
          0 0 auto;
      }

      .tns-sticky-subject-row {
        z-index:
          11 !important;
      }

      .tns-sticky-title-row .dropdown-menu,
      .tns-sticky-title-row .open > .dropdown-menu {
        z-index:
          13 !important;
      }

      #${SPACER_ID} {
        width:
          100%;

        display:
          none;

        height:
          0;
      }

      /*
       * Sticky is completely disabled by JS
       * at 900px and below.
       *
       * We still slightly tighten our toolbar
       * buttons at narrower desktop/tablet widths.
       */
      @media (max-width: 1100px) {
        #${TOOLBAR_ID} .btn {
          padding-left:
            7px;

          padding-right:
            7px;
        }
      }
    `;

    document.head.appendChild(
      style
    );
  }

  // ============================================================
  // Initialization
  // ============================================================

  function initialize() {
    if (
      !/\/tickets\/\d+/i.test(
        location.pathname
      )
    ) {
      return false;
    }

    injectStyles();

    const toolbarReady =
      ensureToolbar();

    const stickyReady =
      ensureStickyTicketHeaderRows();

    return (
      toolbarReady &&
      stickyReady
    );
  }

  /*
   * Close Copy dropdown when clicking elsewhere.
   */
  document.addEventListener(
    'click',
    event => {
      if (
        !event.target.closest(
          '#' +
          TOOLBAR_ID +
          ' .tns-ticket-copy-more'
        )
      ) {
        closeCopyMenus();
      }
    }
  );

  document.addEventListener(
    'keydown',
    event => {
      if (
        event.key ===
        'Escape'
      ) {
        closeCopyMenus();
      }
    }
  );

  /*
   * Syncro mounts some ticket components
   * asynchronously.
   */
  let attempts =
    0;

  const initTimer =
    setInterval(
      () => {
        attempts +=
          1;

        if (
          initialize() ||
          attempts >= 40
        ) {
          clearInterval(
            initTimer
          );
        }
      },
      250
    );

})();
