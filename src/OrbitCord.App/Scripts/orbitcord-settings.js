(() => {
  if (window.__orbitcordSettings) return;
  window.__orbitcordSettings = true;

  const webview = window.chrome?.webview;
  if (!webview) return;

  const SECTION_ID = 'orbitcord-settings-section';
  const SHORTCUT_TAB_ID = 'orbitcord-shortcut-tab';
  const CUSTOM_TAB_ID = 'orbitcord-customisation-tab';
  const OPTIONS_TAB_ID = 'orbitcord-options-tab';
  const SHORTCUT_PAGE_ID = 'orbitcord-shortcut-page';
  const CUSTOM_PAGE_ID = 'orbitcord-customisation-page';
  const OPTIONS_PAGE_ID = 'orbitcord-options-page';
  const PANEL_HOST_ID = 'orbitcord-settings-panel-host';

  const FALLBACK_ACTIONS = [
    { id: 'TOGGLE_MUTE', name: 'Mute microfono', description: '', isHold: false },
    { id: 'TOGGLE_DEAFEN', name: 'Deafen', description: '', isHold: false }
  ];
  const CORE_ACTION_IDS = new Set(['TOGGLE_MUTE', 'TOGGLE_DEAFEN']);


  let actions = FALLBACK_ACTIONS.map(action => ({ ...action }));
  let bindings = [];
  let hookRunning = false;
  let shortcutRevision = -1;
  let recordingId = null;
  let recordingPreviewChord = '';
  let openActionPickerId = null;
  let lastShortcutStatus = null;
  let shortcutInputError = '';
  let activeEntryKey = null;
  let selectedIcon = 'purple';
  let customIconDataUrl = '';
  let customisationError = '';
  let customAppName = '';
  let displayAppName = 'OrbitCord';
  let disableSelfStreamPreview = false;

  const iconPresetData = new Map();
  const ICON_PRESETS = [
    { id: 'purple', name: 'Default' },
    { id: 'green', name: 'Green' },
    { id: 'orange', name: 'Orange' },
    { id: 'red', name: 'Red' },
    { id: 'blue', name: 'Blue' }
  ];
  const SETTINGS_ENTRIES = [
    { key: 'shortcut', title: 'Shortcut', tabId: SHORTCUT_TAB_ID, pageId: SHORTCUT_PAGE_ID },
    { key: 'customisation', title: 'Customisation', tabId: CUSTOM_TAB_ID, pageId: CUSTOM_PAGE_ID },
    { key: 'options', title: 'Options', tabId: OPTIONS_TAB_ID, pageId: OPTIONS_PAGE_ID }
  ];

  let mountScheduled = false;
  let detectedTextSidebar = null;
  let detectedContentBranch = null;
  let portalSidebar = null;
  let portalRoot = null;
  let settingsLifecycleObserver = null;
  let settingsLifecycleParent = null;
  const mountBurstTimers = new Set();

  const normalizeText = value => String(value || '')
    .toLowerCase()
    .normalize?.('NFD')
    .replace?.(/[\u0300-\u036f]/g, '') || String(value || '').toLowerCase();

  const SETTINGS_TEXT_GROUPS = [
    [/\baccount\b/, /dati e privacy|privacy.*data|data.*privacy/, /permessi dei messaggi|message permissions?/, /notifiche|notifications?/],
    [/fatturazione|billing/, /\bnitro\b/, /potenziamento server|server boost/, /abbonamenti|subscriptions?/],
    [/voce e video|voice.*video/, /aspetto|appearance/, /accessibilita|accessibility/, /\bsistema\b|\bsystem\b/, /lingua e orario|language.*time/],
    [/giochi e app|games.*apps/, /privacy attivita|activity privacy/]
  ];

  const post = payload => {
    try { webview.postMessage(payload); } catch {}
  };

  const requestState = () => post({ type: 'orbitcord-shortcuts-request' });

  function normalizeCustomAppName(value) {
    let normalized = String(value || '').trim().replace(/\s+/g, ' ');
    const suffix = '(OrbitCord)';
    if (normalized.toLowerCase().endsWith(suffix.toLowerCase())) normalized = normalized.slice(0, -suffix.length).trim();
    if (normalized.toLowerCase() === 'orbitcord') normalized = '';
    return normalized.slice(0, 32).trimEnd();
  }

  function formatDisplayAppName(value) {
    const normalized = normalizeCustomAppName(value);
    return normalized ? `${normalized} (OrbitCord)` : 'OrbitCord';
  }

  function makeId() {
    try { return crypto.randomUUID(); }
    catch { return `orbitcord-${Date.now()}-${Math.random().toString(16).slice(2)}`; }
  }

  function cloneBinding(binding) {
    return {
      id: String(binding?.id || makeId()),
      action: String(binding?.action || actions[0]?.id || 'TOGGLE_MUTE'),
      virtualKeys: Array.isArray(binding?.virtualKeys) ? binding.virtualKeys.map(Number).filter(Number.isFinite) : [],
      enabled: binding?.enabled !== false,
      chord: String(binding?.chord || '')
    };
  }

  function setRecording(id) {
    const bindingId = String(id || '');
    if (!bindingId) return;
    shortcutInputError = '';
    recordingPreviewChord = '';
    openActionPickerId = null;
    if (recordingId === bindingId) {
      post({ type: 'orbitcord-shortcut-recording-cancel' });
    } else {
      post({ type: 'orbitcord-shortcut-recording-begin', id: bindingId });
    }
  }

  function cancelRecording() {
    if (!recordingId) return;
    post({ type: 'orbitcord-shortcut-recording-cancel' });
  }

  function removeBinding(id) {
    const bindingId = String(id || '');
    if (!bindingId) return;
    if (recordingId === bindingId) post({ type: 'orbitcord-shortcut-recording-cancel' });
    if (openActionPickerId === bindingId) openActionPickerId = null;
    post({ type: 'orbitcord-shortcut-delete', id: bindingId });
  }

  function create(tag, css, text) {
    const element = document.createElement(tag);
    if (css) Object.assign(element.style, css);
    if (text != null) element.textContent = text;
    return element;
  }

  function buttonStyle(primary = false) {
    return {
      border: '0',
      borderRadius: '4px',
      padding: '8px 14px',
      minHeight: '32px',
      fontWeight: '600',
      cursor: 'pointer',
      color: '#fff',
      background: primary ? 'var(--brand-500, #5865f2)' : 'var(--background-modifier-selected, #4e5058)',
      fontFamily: 'inherit'
    };
  }

  function selectStyle() {
    return {
      minHeight: '40px',
      border: '1px solid var(--background-modifier-accent, #1e1f22)',
      borderRadius: '4px',
      background: 'var(--input-background, #1e1f22)',
      color: 'var(--text-normal, #dbdee1)',
      padding: '0 10px',
      fontFamily: 'inherit',
      fontSize: '14px',
      outline: 'none',
      width: '100%'
    };
  }

  function elementDepth(element) {
    let depth = 0;
    for (let node = element; node?.parentElement; node = node.parentElement) depth++;
    return depth;
  }

  function findSettingsSidebarByText() {
    const candidates = [...(document.querySelectorAll?.('nav, aside, section, div') || [])]
      .filter(element => element !== document.body && !element.closest?.(`#${SECTION_ID}`))
      .filter(element => !element.querySelector?.('main, [role="main"], [data-settings-content="true"]'))
      .map(element => {
        const text = normalizeText(element.textContent);
        const groupHits = SETTINGS_TEXT_GROUPS.map(group => group.filter(pattern => pattern.test(text)).length);
        const groupsMatched = groupHits.filter(count => count > 0).length;
        const markersMatched = groupHits.reduce((sum, count) => sum + count, 0);
        return { element, groupsMatched, markersMatched, depth: elementDepth(element), textLength: text.length };
      })
      .filter(candidate => candidate.groupsMatched >= 3 && candidate.markersMatched >= 7)
      .sort((a, b) =>
        b.groupsMatched - a.groupsMatched ||
        b.depth - a.depth ||
        b.markersMatched - a.markersMatched ||
        a.textLength - b.textLength);

    return candidates[0]?.element || null;
  }

  function countSettingsMarkers(element) {
    const text = normalizeText(element?.textContent);
    return SETTINGS_TEXT_GROUPS.reduce((sum, group) =>
      sum + group.filter(pattern => pattern.test(text)).length, 0);
  }

  function scoreContentCandidate(candidate, sidebar) {
    if (!candidate || candidate === sidebar || candidate.contains?.(sidebar)) return -1000;
    if (candidate.closest?.(`#${SECTION_ID}`)) return -1000;

    let score = 0;
    const text = normalizeText(candidate.textContent).trim();
    const tag = normalizeText(candidate.tagName);

    if (candidate.matches?.('main, [role="main"], [class*="contentRegion"], [data-settings-content="true"]')) score += 140;
    if (candidate.querySelector?.('main, [role="main"], [class*="contentRegion"], [data-settings-content="true"]')) score += 100;
    if (candidate.querySelector?.('h1, h2, h3')) score += 35;
    if (text.length >= 20) score += 10;
    if (text.length >= 80) score += 10;
    if (tag === 'main') score += 30;

    const markerCount = countSettingsMarkers(candidate);
    if (markerCount >= 5) score -= 80;

    try {
      const sidebarRect = sidebar.getBoundingClientRect?.();
      const rect = candidate.getBoundingClientRect?.();
      if (sidebarRect && rect && rect.width > 0 && rect.height > 0 && sidebarRect.width > 0) {
        const toRight = rect.left >= sidebarRect.right - 8;
        const largeEnough = rect.width >= Math.max(260, sidebarRect.width * .8) && rect.height >= Math.min(300, sidebarRect.height * .45);
        if (toRight && largeEnough) score += 180;
      }
    } catch {}

    return score;
  }

  function findSettingsPairAroundSidebar(sidebar) {
    if (!sidebar) return null;
    let branch = sidebar;
    let parent = sidebar.parentElement;
    let best = null;

    while (parent && parent !== document.body) {
      for (const sibling of [...(parent.children || [])].filter(child => child !== branch)) {
        const score = scoreContentCandidate(sibling, sidebar);
        if (!best || score > best.score) best = { root: parent, content: sibling, score };
      }
      branch = parent;
      parent = parent.parentElement;
    }

    return best && best.score >= 20 ? best : null;
  }

  function findSettingsRoot() {
    detectedTextSidebar = null;
    detectedContentBranch = null;

    const legacyRoot = document.querySelector('[class*="standardSidebarView"]');
    if (legacyRoot) return legacyRoot;

    const tablists = [...(document.querySelectorAll?.('[role="tablist"]') || [])];
    const settingsMarkers = [
      /my account|il mio account|account personale/,
      /profiles?|profili?/,
      /privacy|sicurezza|safety/,
      /connections?|connessioni?/,
      /voice|voce|video/,
      /notifications?|notifiche/,
      /keybind|shortcut|associazioni tasti/,
      /accessibility|accessibilita/,
      /language|lingua/,
      /advanced|avanzate?/
    ];

    const candidates = tablists.map(tablist => {
      const tabs = [...(tablist.querySelectorAll?.('[role="tab"]') || [])];
      const aria = normalizeText(tablist.getAttribute?.('aria-label'));
      const text = normalizeText(`${aria} ${tablist.textContent || ''}`);
      const explicit = /user settings|impostazioni utente|settings navigation|navigazione impostazioni/.test(aria)
        || !!tablist.closest?.('[data-settings-shell="true"]');
      const markerHits = settingsMarkers.filter(pattern => pattern.test(text)).length;
      const accepted = explicit || (tabs.length >= 5 && markerHits >= 2);
      return { tablist, tabs, markerHits, accepted, score: (explicit ? 100 : 0) + markerHits * 10 + tabs.length };
    }).filter(candidate => candidate.accepted).sort((a, b) => b.score - a.score);

    const tablist = candidates[0]?.tablist || null;
    if (tablist) {
      let node = tablist;
      while (node?.parentElement) {
        const parent = node.parentElement;
        const hasContent = parent.querySelector?.('[class*="contentRegion"], [data-settings-content="true"], main, [role="main"]');
        if (hasContent) return parent;
        node = parent;
      }
    }

    detectedTextSidebar = findSettingsSidebarByText();
    const pair = findSettingsPairAroundSidebar(detectedTextSidebar);
    if (pair) {
      detectedContentBranch = pair.content;
      return pair.root;
    }
    return detectedTextSidebar?.parentElement || null;
  }

  function findSidebar(root) {
    if (detectedTextSidebar && (root === detectedTextSidebar || root?.contains?.(detectedTextSidebar))) return detectedTextSidebar;

    const region = root?.querySelector?.('[class*="sidebarRegion"]');
    const legacySidebar = region?.querySelector?.('[class*="sidebar"]') || region;
    if (legacySidebar) return legacySidebar;

    const semanticSidebar = root?.querySelector?.('[role="tablist"]');
    if (semanticSidebar) return semanticSidebar;

    const tabs = [...(root?.querySelectorAll?.('[role="tab"]') || [])];
    if (!tabs.length) return null;
    let node = tabs[0].parentElement;
    while (node && node !== root) {
      const count = node.querySelectorAll?.('[role="tab"]')?.length || 0;
      if (count >= Math.min(2, tabs.length)) return node;
      node = node.parentElement;
    }
    return tabs[0].parentElement || null;
  }

  function findContentScroller(root) {
    const region = root?.querySelector?.('[class*="contentRegion"]');
    const legacyScroller = region?.querySelector?.('[class*="contentRegionScroller"]');
    if (legacyScroller) return legacyScroller;

    const semantic = root?.querySelector?.('[data-settings-content="true"], [role="main"], main');
    if (semantic) return semantic;

    const branch = detectedContentBranch || region;
    if (!branch) return null;

    const nestedSemantic = branch.querySelector?.('[data-settings-content="true"], [role="main"], main, [class*="contentRegionScroller"]');
    if (nestedSemantic) return nestedSemantic;

    const descendants = [...(branch.querySelectorAll?.('section, div') || [])]
      .map(element => ({
        element,
        score: (element.querySelector?.('h1, h2, h3') ? 30 : 0) +
          (normalizeText(element.textContent).trim().length >= 20 ? 10 : 0) -
          (countSettingsMarkers(element) >= 5 ? 60 : 0),
        depth: elementDepth(element)
      }))
      .filter(candidate => candidate.score >= 30)
      .sort((a, b) => b.score - a.score || b.depth - a.depth);

    return descendants[0]?.element || branch;
  }

  function findGamesGroupAnchor(sidebar) {
    const nodes = [...(sidebar?.querySelectorAll?.('div, span, h1, h2, h3, h4, h5, h6') || [])];
    const marker = nodes.find(node => /^(giochi e app|games(?: and| &) apps)$/.test(normalizeText(node.textContent).trim()));
    if (!marker) return null;
    let node = marker;
    while (node?.parentElement && node.parentElement !== sidebar) node = node.parentElement;
    return node?.parentElement === sidebar ? node : null;
  }

  function findTemplate(sidebar, selector) {
    const elements = sidebar?.querySelectorAll?.(selector) || [];
    return [...elements].find(element => !element.closest?.(`#${SECTION_ID}`)) || elements[0] || null;
  }

  function styleSectionLabel(label, template) {
    if (template?.className) label.className = template.className;
    Object.assign(label.style, {
      marginTop: '18px',
      marginBottom: '8px',
      padding: '0 10px',
      color: 'var(--channels-default, #949ba4)',
      fontSize: '12px',
      lineHeight: '16px',
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: '.02em'
    });
  }

  function styleTab(tab, template) {
    if (template?.className) tab.className = template.className;
    Object.assign(tab.style, {
      margin: '2px 8px',
      padding: '6px 10px',
      borderRadius: '4px',
      color: 'var(--interactive-normal, #b5bac1)',
      cursor: 'pointer',
      fontSize: '16px',
      lineHeight: '20px',
      userSelect: 'none'
    });
  }

  function updateTabAppearance() {
    for (const entry of SETTINGS_ENTRIES) {
      const active = activeEntryKey === entry.key;
      const tab = document.getElementById(entry.tabId);
      if (!tab) continue;
      tab.style.background = active ? 'var(--background-modifier-selected, rgba(78,80,88,.6))' : '';
      tab.style.color = active ? 'var(--interactive-active, #fff)' : 'var(--interactive-normal, #b5bac1)';
      tab.setAttribute('aria-selected', active ? 'true' : 'false');
    }
  }

  function buildSection(sidebar) {
    let section = document.getElementById(SECTION_ID);
    if (section && section.parentElement !== sidebar) section.remove();
    section = document.getElementById(SECTION_ID);
    if (section) return section;

    const headerTemplate = findTemplate(sidebar, '[class*="header"]');
    const tabTemplate = findTemplate(sidebar, '[role="tab"]');

    section = create('div');
    section.id = SECTION_ID;
    section.dataset.orbitcordOwned = 'true';

    const label = create('div', null, 'OrbitCord');
    styleSectionLabel(label, headerTemplate);
    section.append(label);

    for (const entry of SETTINGS_ENTRIES) {
      const tab = create('div', null, entry.title);
      tab.id = entry.tabId;
      tab.setAttribute('role', 'tab');
      tab.setAttribute('aria-selected', 'false');
      tab.setAttribute('aria-controls', entry.pageId);
      tab.dataset.orbitcordEntry = entry.key;
      tab.tabIndex = 0;
      styleTab(tab, tabTemplate);
      const activateFromEvent = event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        event?.stopImmediatePropagation?.();
        activateSettingsEntry(entry.key);
      };
      tab.addEventListener('click', activateFromEvent);
      tab.addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === ' ') activateFromEvent(event);
      });
      section.append(tab);
    }

    const gamesAnchor = findGamesGroupAnchor(sidebar);
    if (gamesAnchor && sidebar.insertBefore) sidebar.insertBefore(section, gamesAnchor);
    else sidebar.append(section);
    return section;
  }

  function attachSidebarExitListener(sidebar, section) {
    if (sidebar.dataset.orbitcordShortcutExitListener === 'true') return;
    sidebar.dataset.orbitcordShortcutExitListener = 'true';
    sidebar.addEventListener('click', event => {
      if (!activeEntryKey) return;
      const currentSection = document.getElementById(SECTION_ID) || section;
      if (currentSection?.contains?.(event.target)) return;
      deactivateOrbitPage();
    }, true);
  }

  function getSettingsEntry(key) {
    return SETTINGS_ENTRIES.find(entry => entry.key === key) || null;
  }

  function activateSettingsEntry(key) {
    const entry = getSettingsEntry(key);
    if (!entry) return;

    activeEntryKey = entry.key;
    if (entry.key !== 'shortcut') {
      if (recordingId) cancelRecording();
      openActionPickerId = null;
    }
    updateTabAppearance();
    mountActivePage(true);

    if (entry.key === 'shortcut') requestState();
    else if (entry.key === 'customisation') post({ type: 'orbitcord-customisation-request' });
    else if (entry.key === 'options') post({ type: 'orbitcord-options-request' });
  }

  function activateShortcutPage() {
    activateSettingsEntry('shortcut');
  }

  function activateCustomisationPage() {
    activateSettingsEntry('customisation');
  }

  function activateOptionsPage() {
    activateSettingsEntry('options');
  }

  function disconnectSettingsLifecycle() {
    try { settingsLifecycleObserver?.disconnect?.(); } catch {}
    settingsLifecycleObserver = null;
    settingsLifecycleParent = null;
  }

  function observeSettingsLifecycle(root) {
    const parent = root?.parentElement || null;
    if (!root || !parent || typeof MutationObserver !== 'function') return;
    if (settingsLifecycleObserver && settingsLifecycleParent === parent) return;
    disconnectSettingsLifecycle();
    settingsLifecycleParent = parent;
    settingsLifecycleObserver = new MutationObserver(() => {
      if (!activeEntryKey || !portalRoot) return;
      const stillMounted = portalRoot.parentElement === settingsLifecycleParent
        && settingsLifecycleParent.contains?.(portalRoot);
      if (!stillMounted) deactivateOrbitPage();
    });
    settingsLifecycleObserver.observe(parent, { childList: true });
  }

  function restoreNativeContent() {
    disconnectSettingsLifecycle();
    document.getElementById(PANEL_HOST_ID)?.remove?.();
    portalSidebar = null;
    portalRoot = null;
  }

  function deactivateOrbitPage() {
    removeIconContextMenu?.();
    activeEntryKey = null;
    openActionPickerId = null;
    if (recordingId) cancelRecording();
    restoreNativeContent();
    updateTabAppearance();
  }

  function rectLooksUsable(rect) {
    return !!rect && Number(rect.right) > Number(rect.left) && Number(rect.bottom) > Number(rect.top);
  }

  function positionPanelHost(host, sidebar, root) {
    if (!host || !sidebar) return;

    let sidebarRect = null;
    let rootRect = null;
    try { sidebarRect = sidebar.getBoundingClientRect?.(); } catch {}
    try { rootRect = root?.getBoundingClientRect?.(); } catch {}

    const viewportWidth = Math.max(0, Number(window.innerWidth) || 0);
    const viewportHeight = Math.max(0, Number(window.innerHeight) || 0);

    const left = rectLooksUsable(sidebarRect) ? Math.max(0, Math.round(sidebarRect.right)) : 340;
    const top = rectLooksUsable(rootRect) ? Math.max(0, Math.round(rootRect.top)) : 0;
    const rootRight = rectLooksUsable(rootRect) ? Math.round(rootRect.right) : viewportWidth;
    const rootBottom = rectLooksUsable(rootRect) ? Math.round(rootRect.bottom) : viewportHeight;

    // Keep Discord's close/ESC tools column clickable when there is enough room.
    const available = Math.max(0, rootRight - left);
    const toolsGap = available >= 520 ? 72 : 0;
    const right = viewportWidth > 0 ? Math.max(0, Math.round(viewportWidth - rootRight + toolsGap)) : toolsGap;
    const bottom = viewportHeight > 0 ? Math.max(0, Math.round(viewportHeight - rootBottom)) : 0;

    Object.assign(host.style, {
      left: `${left}px`,
      top: `${top}px`,
      right: `${right}px`,
      bottom: `${bottom}px`
    });
  }

  function ensurePanelHost() {
    const root = findSettingsRoot();
    const sidebar = findSidebar(root);
    if (!root || !sidebar || !document.body) return null;

    let host = document.getElementById(PANEL_HOST_ID);
    if (host && host.parentElement !== document.body) {
      host.remove?.();
      host = null;
    }

    if (!host) {
      host = create('div', {
        position: 'fixed',
        zIndex: '2147483000',
        overflow: 'hidden',
        boxSizing: 'border-box',
        background: 'var(--background-primary, #313338)',
        color: 'var(--text-normal, #dbdee1)',
        fontFamily: 'var(--font-primary, gg sans, sans-serif)',
        borderLeft: '1px solid var(--background-modifier-accent, rgba(255,255,255,.06))'
      });
      host.id = PANEL_HOST_ID;
      host.dataset.orbitcordOwned = 'true';
      document.body.append(host);
    }

    portalSidebar = sidebar;
    portalRoot = root;
    observeSettingsLifecycle(root);
    positionPanelHost(host, sidebar, root);
    return host;
  }

  function ensurePage(entry) {
    const host = ensurePanelHost();
    if (!host || !entry) return null;

    let page = document.getElementById(entry.pageId);
    if (page && page.parentElement !== host) page.remove();
    page = document.getElementById(entry.pageId);

    if (!page) {
      page = create('div', {
        height: '100%', minHeight: '100%', overflowY: 'auto', boxSizing: 'border-box',
        padding: '60px max(40px, calc((100% - 740px) / 2)) 80px',
        background: 'var(--background-primary, #313338)', color: 'var(--text-normal, #dbdee1)',
        fontFamily: 'var(--font-primary, gg sans, sans-serif)'
      });
      page.id = entry.pageId;
      page.dataset.orbitcordEntry = entry.key;
    }

    if (host.children?.length !== 1 || host.children[0] !== page) host.replaceChildren(page);
    return page;
  }

  function mountActivePage(forceRender = false) {
    const entry = getSettingsEntry(activeEntryKey);
    if (!entry) return;
    const page = ensurePage(entry);
    if (!page) return;
    if (!forceRender && page.dataset.orbitcordRendered === 'true') return;

    if (entry.key === 'shortcut') renderShortcutPage();
    else if (entry.key === 'customisation') renderCustomisationPage();
    else if (entry.key === 'options') renderOptionsPage();
    page.dataset.orbitcordRendered = 'true';
  }

  function mountShortcutPage() {
    if (activeEntryKey !== 'shortcut') return;
    mountActivePage();
  }

  function formatKey(vk) {
    const names = {
      0x08: 'Backspace', 0x09: 'Tab', 0x0D: 'Enter', 0x10: 'Shift', 0x11: 'Ctrl', 0x12: 'Alt',
      0x13: 'Pause', 0x14: 'Caps Lock', 0x1B: 'Esc', 0x20: 'Space', 0x21: 'Page Up', 0x22: 'Page Down',
      0x23: 'End', 0x24: 'Home', 0x25: '←', 0x26: '↑', 0x27: '→', 0x28: '↓', 0x2C: 'Print Screen',
      0x2D: 'Insert', 0x2E: 'Delete', 0x5B: 'Win', 0x5C: 'Win', 0x90: 'Num Lock', 0x91: 'Scroll Lock',
      0xBA: ';', 0xBB: '+', 0xBC: ',', 0xBD: '-', 0xBE: '.', 0xBF: '/', 0xC0: '`',
      0xDB: '[', 0xDC: '\\', 0xDD: ']', 0xDE: "'"
    };
    if (names[vk]) return names[vk];
    if (vk >= 0x30 && vk <= 0x39) return String.fromCharCode(vk);
    if (vk >= 0x41 && vk <= 0x5A) return String.fromCharCode(vk);
    if (vk >= 0x60 && vk <= 0x69) return `Num ${vk - 0x60}`;
    if (vk >= 0x70 && vk <= 0x87) return `F${vk - 0x6F}`;
    return `VK_${vk.toString(16).toUpperCase().padStart(2, '0')}`;
  }

  function formatChord(binding) {
    if (binding.chord) return binding.chord;
    return (binding.virtualKeys || []).map(formatKey).join(' + ');
  }

  function renderShortcutPage() {
    const page = document.getElementById(SHORTCUT_PAGE_ID);
    if (!page) return;
    page.replaceChildren();

    const title = create('h2', {
      margin: '0 0 8px',
      color: 'var(--header-primary, #f2f3f5)',
      fontSize: '24px',
      lineHeight: '30px',
      fontWeight: '700'
    }, 'Shortcut');
    const toolbar = create('div', {
      display: 'flex',
      justifyContent: 'flex-end',
      alignItems: 'center',
      marginBottom: '16px'
    });
    const add = create('button', buttonStyle(true), 'Aggiungi');
    add.type = 'button';
    add.addEventListener('click', () => {
      post({ type: 'orbitcord-shortcut-create', action: actions[0]?.id || 'TOGGLE_MUTE' });
    });
    toolbar.append(add);

    page.append(title, toolbar);

    const hookStatus = create('div', {
      margin: '-2px 0 16px',
      color: hookRunning ? 'var(--text-positive, #23a55a)' : 'var(--text-muted, #b5bac1)',
      fontSize: '13px'
    }, hookRunning ? 'Shortcut globali attive' : 'Shortcut globali non attive');
    page.append(hookStatus);

    if (shortcutInputError) {
      page.append(create('div', {
        margin: '-8px 0 16px',
        color: 'var(--text-danger, #f23f42)',
        fontSize: '13px',
        lineHeight: '18px'
      }, shortcutInputError));
    }

    if (lastShortcutStatus) {
      const actionName = actions.find(action => action.id === lastShortcutStatus.action)?.name || lastShortcutStatus.action || 'Azione';
      const verified = lastShortcutStatus.ok === true && lastShortcutStatus.detail === 'verified-state-change';
      const text = lastShortcutStatus.ok === null
        ? `Prova ${actionName}…`
        : verified
          ? `${actionName}: OK verificato`
          : lastShortcutStatus.ok
            ? `${actionName}: trigger inviato (non verificabile)`
            : `${actionName}: non disponibile`;
      const statusBox = create('div', {
        margin: '-8px 0 16px',
        color: lastShortcutStatus.ok === false
          ? 'var(--text-danger, #f23f42)'
          : verified
            ? 'var(--text-positive, #23a55a)'
            : 'var(--text-muted, #b5bac1)',
        fontSize: '13px'
      }, text);
      if (lastShortcutStatus.ok === false && lastShortcutStatus.detail) {
        statusBox.append(create('div', {
          marginTop: '5px',
          color: 'var(--text-muted, #b5bac1)',
          fontSize: '11px',
          lineHeight: '15px',
          userSelect: 'text',
          whiteSpace: 'normal',
          overflowWrap: 'anywhere'
        }, `Dettaglio: ${lastShortcutStatus.detail}`));
      }
      page.append(statusBox);
    }

    if (!bindings.length) {
      page.append(create('div', {
        padding: '24px',
        borderRadius: '8px',
        background: 'var(--background-secondary, #2b2d31)',
        color: 'var(--text-muted, #b5bac1)',
        textAlign: 'center'
      }, 'Nessuna shortcut.'));
      return;
    }

    for (const binding of bindings) {
      const card = create('div', {
        display: 'grid',
        gridTemplateColumns: 'minmax(180px, 1.2fr) minmax(170px, .9fr) auto auto auto',
        gap: '10px',
        alignItems: 'center',
        background: 'var(--background-secondary, #2b2d31)',
        borderRadius: '8px',
        padding: '12px',
        marginBottom: '8px'
      });

      const selectedAction = actions.find(action => action.id === binding.action) || actions[0];
      if (selectedAction && binding.action !== selectedAction.id) binding.action = selectedAction.id;

      const pickerWrap = create('div', { position: 'relative', minWidth: '0' });
      const picker = create('button', {
        ...selectStyle(),
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '10px',
        textAlign: 'left',
        cursor: 'pointer'
      });
      picker.type = 'button';
      picker.dataset.orbitcordActionPicker = binding.id;
      picker.title = selectedAction?.description || '';
      const pickerText = create('span', { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }, selectedAction?.name || 'Azione');
      const pickerArrow = create('span', { flex: '0 0 auto', color: 'var(--text-muted, #b5bac1)' }, openActionPickerId === binding.id ? '▴' : '▾');
      picker.append(pickerText, pickerArrow);
      picker.addEventListener('click', event => {
        event?.preventDefault?.();
        event?.stopPropagation?.();
        openActionPickerId = openActionPickerId === binding.id ? null : binding.id;
        renderShortcutPage();
      });
      pickerWrap.append(picker);

      if (openActionPickerId === binding.id) {
        const menu = create('div', {
          position: 'absolute',
          zIndex: '2147483646',
          left: '0',
          right: '0',
          top: 'calc(100% + 6px)',
          maxHeight: '300px',
          overflowY: 'auto',
          padding: '6px',
          borderRadius: '6px',
          boxSizing: 'border-box',
          background: 'var(--background-floating, #111214)',
          boxShadow: '0 8px 24px rgba(0,0,0,.35)',
          border: '1px solid var(--background-modifier-accent, rgba(255,255,255,.08))'
        });
        menu.dataset.orbitcordActionMenu = binding.id;

        for (const action of actions) {
          const choice = create('button', {
            width: '100%',
            border: '0',
            borderRadius: '4px',
            padding: '9px 10px',
            margin: '1px 0',
            background: action.id === binding.action ? 'var(--background-modifier-selected, #3f4147)' : 'transparent',
            color: 'var(--text-normal, #dbdee1)',
            textAlign: 'left',
            cursor: 'pointer',
            fontFamily: 'inherit',
            fontSize: '14px'
          }, action.name);
          choice.type = 'button';
          choice.title = action.description || '';
          choice.dataset.orbitcordActionChoice = action.id;
          choice.addEventListener('click', event => {
            event?.preventDefault?.();
            event?.stopPropagation?.();
            openActionPickerId = null;
            lastShortcutStatus = null;
            post({ type: 'orbitcord-shortcut-action', id: binding.id, action: action.id });
          });
          menu.append(choice);
        }
        pickerWrap.append(menu);
      }

      const record = create('button', buttonStyle(false));
      record.type = 'button';
      record.textContent = recordingId === binding.id
        ? (recordingPreviewChord || 'Premi i tasti… (clicca per annullare)')
        : (formatChord(binding) || 'Imposta tasti');
      if (recordingId === binding.id) {
        record.style.outline = '2px solid var(--brand-500, #5865f2)';
        record.style.background = 'var(--background-modifier-selected, #3f4147)';
      }
      record.addEventListener('click', () => setRecording(binding.id));

      const testAction = create('button', buttonStyle(false), 'Prova');
      testAction.type = 'button';
      testAction.title = 'Prova questa azione';
      testAction.addEventListener('click', () => {
        lastShortcutStatus = { action: binding.action, ok: null, detail: 'testing' };
        post({ type: 'orbitcord-shortcut-test', action: binding.action });
        renderShortcutPage();
      });

      const enabledLabel = create('label', {
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        color: 'var(--text-normal, #dbdee1)',
        fontSize: '13px'
      });
      const enabled = document.createElement('input');
      enabled.type = 'checkbox';
      enabled.checked = binding.enabled !== false;
      enabled.addEventListener('change', () => {
        post({ type: 'orbitcord-shortcut-enabled', id: binding.id, enabled: enabled.checked });
      });
      enabledLabel.append(enabled, document.createTextNode('Attiva'));

      const remove = create('button', buttonStyle(false), '×');
      remove.type = 'button';
      remove.title = 'Rimuovi shortcut';
      remove.style.fontSize = '19px';
      remove.style.padding = '4px 11px';
      remove.addEventListener('click', () => removeBinding(binding.id));

      card.append(pickerWrap, record, testAction, enabledLabel, remove);
      page.append(card);
    }
  }

  function removeIconContextMenu() {
    document.getElementById('orbitcord-icon-context-menu')?.remove?.();
  }

  function availableIconCount() {
    return iconPresetData.size + (customIconDataUrl ? 1 : 0);
  }

  function openIconContextMenu(iconId, event) {
    removeIconContextMenu();
    event?.preventDefault?.();
    event?.stopPropagation?.();

    const canDelete = availableIconCount() > 1;
    const menu = create('div', {
      position: 'fixed',
      left: `${Math.max(8, Number(event?.clientX || 0))}px`,
      top: `${Math.max(8, Number(event?.clientY || 0))}px`,
      minWidth: '170px',
      padding: '6px',
      borderRadius: '8px',
      background: 'var(--background-floating, #111214)',
      boxShadow: '0 8px 24px rgba(0,0,0,.35)',
      zIndex: '2147483647'
    });
    menu.id = 'orbitcord-icon-context-menu';

    const remove = create('button', {
      ...buttonStyle(false),
      width: '100%',
      textAlign: 'left',
      background: canDelete ? 'transparent' : 'transparent',
      color: canDelete ? 'var(--text-danger, #f23f42)' : 'var(--text-muted, #949ba4)',
      cursor: canDelete ? 'pointer' : 'not-allowed'
    }, canDelete ? 'Elimina' : 'Deve rimanere almeno 1 icona');
    remove.type = 'button';
    remove.disabled = !canDelete;
    if (canDelete) {
      remove.addEventListener('click', () => {
        removeIconContextMenu();
        post({ type: 'orbitcord-icon-delete', icon: iconId });
      });
    }
    menu.append(remove);
    document.body?.append?.(menu);
  }

  function bindIconContextMenu(button, iconId) {
    button.addEventListener('contextmenu', event => openIconContextMenu(iconId, event));
  }

  function removeOrbitcordModal(id) {
    document.getElementById(id)?.remove?.();
  }

  function makeModal(id, titleText, width = '620px') {
    removeOrbitcordModal(id);
    const backdrop = create('div', {
      position:'fixed', inset:'0', zIndex:'2147483647', background:'rgba(0,0,0,.68)',
      display:'flex', alignItems:'center', justifyContent:'center', padding:'24px', boxSizing:'border-box', pointerEvents:'auto'
    });
    backdrop.id = id;
    backdrop.dataset.orbitcordOwned = 'true';
    const panel = create('div', {
      width:`min(${width}, calc(100vw - 48px))`, maxHeight:'calc(100vh - 48px)', overflow:'auto',
      borderRadius:'14px', background:'var(--background-primary, #313338)', color:'var(--text-normal, #dbdee1)',
      boxShadow:'0 24px 80px rgba(0,0,0,.55)', border:'1px solid rgba(255,255,255,.08)', padding:'20px', boxSizing:'border-box', pointerEvents:'auto', isolation:'isolate'
    });
    const head = create('div', {display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px',marginBottom:'18px'});
    head.append(create('h3',{margin:'0',fontSize:'20px',color:'var(--header-primary,#f2f3f5)'},titleText));
    const close=create('button',{...buttonStyle(false),padding:'4px 10px',fontSize:'18px'},'×'); close.type='button';
    close.addEventListener('click',()=>backdrop.remove?.()); head.append(close); panel.append(head); backdrop.append(panel);
    backdrop.addEventListener('click',e=>{ if(e.target===backdrop) backdrop.remove?.(); });
    document.body?.append?.(backdrop);
    return { backdrop, panel };
  }


  function renderOptionsPage() {
    const page = document.getElementById(OPTIONS_PAGE_ID);
    if (!page) return;
    page.replaceChildren();

    const title = create('h2', {
      margin: '0 0 8px', color: 'var(--header-primary, #f2f3f5)', fontSize: '24px', lineHeight: '30px', fontWeight: '700'
    }, 'Options');
    const intro = create('div', {
      marginBottom: '24px', color: 'var(--text-muted, #949ba4)', fontSize: '14px', lineHeight: '20px'
    }, 'OrbitCord runtime and performance options.');

    const row = create('div', {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px',
      maxWidth: '720px', padding: '16px', borderRadius: '8px',
      background: 'var(--background-secondary, #2b2d31)'
    });
    const copy = create('div', { minWidth: '0' });
    copy.append(
      create('div', { color: 'var(--header-primary, #f2f3f5)', fontWeight: '600', marginBottom: '5px' }, 'Disable self stream preview'),
      create('div', { color: 'var(--text-muted, #949ba4)', fontSize: '13px', lineHeight: '18px' },
        'When you share your screen, OrbitCord stops rendering your own local preview while keeping the outgoing stream untouched.')
    );

    const toggleLabel = create('label', {
      display: 'flex', alignItems: 'center', gap: '8px', flex: '0 0 auto',
      color: 'var(--text-normal, #dbdee1)', fontSize: '13px', cursor: 'pointer'
    });
    const toggle = document.createElement('input');
    toggle.type = 'checkbox';
    toggle.id = 'orbitcord-option-disable-self-stream-preview';
    toggle.checked = disableSelfStreamPreview;
    toggle.addEventListener('change', () => {
      disableSelfStreamPreview = !!toggle.checked;
      post({ type: 'orbitcord-options-save', disableSelfStreamPreview });
    });
    toggleLabel.append(toggle, document.createTextNode(disableSelfStreamPreview ? 'On' : 'Off'));

    row.append(copy, toggleLabel);
    page.append(title, intro, row);
  }

  function renderCustomisationPage() {
    removeIconContextMenu();
    const page = document.getElementById(CUSTOM_PAGE_ID);
    if (!page) return;
    page.replaceChildren();

    const title = create('h2', {
      margin: '0 0 28px', color: 'var(--header-primary, #f2f3f5)', fontSize: '24px', lineHeight: '30px', fontWeight: '700'
    }, 'Customisation');
    const label = create('div', {
      marginBottom: '12px', color: 'var(--header-secondary, #b5bac1)', fontSize: '12px', fontWeight: '700', textTransform: 'uppercase'
    }, 'Change OrbitCord icon');
    const row = create('div', {
      display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', marginBottom: '18px'
    });

    for (const preset of ICON_PRESETS.filter(item => iconPresetData.has(item.id))) {
      const selected = selectedIcon === preset.id;
      const button = create('button', {
        width: '74px', height: '74px', padding: '4px', borderRadius: '12px', cursor: 'pointer',
        border: selected ? '2px solid var(--brand-500, #5865f2)' : '2px solid transparent',
        background: selected ? 'var(--background-modifier-selected, #3f4147)' : 'transparent'
      });
      button.type = 'button';
      button.id = `orbitcord-icon-preset-${preset.id}`;
      button.title = preset.name;
      const img = create('img', { width: '62px', height: '62px', borderRadius: '12px', display: 'block', objectFit: 'cover' });
      img.alt = preset.name;
      img.src = iconPresetData.get(preset.id) || '';
      button.append(img);
      button.addEventListener('click', () => {
        selectedIcon = preset.id;
        customisationError = '';
        renderCustomisationPage();
        post({ type: 'orbitcord-icon-select', icon: preset.id });
      });
      bindIconContextMenu(button, preset.id);
      row.append(button);
    }

    if (customIconDataUrl) {
      const selected = selectedIcon === 'custom';
      const customButton = create('button', {
        width: '74px', height: '74px', padding: '4px', borderRadius: '12px', cursor: 'pointer',
        border: selected ? '2px solid var(--brand-500, #5865f2)' : '2px solid transparent',
        background: selected ? 'var(--background-modifier-selected, #3f4147)' : 'transparent'
      });
      customButton.type = 'button';
      customButton.id = 'orbitcord-icon-preset-custom';
      customButton.title = 'Custom';
      const img = create('img', { width: '62px', height: '62px', borderRadius: '12px', display: 'block', objectFit: 'cover' });
      img.alt = 'Custom'; img.src = customIconDataUrl;
      customButton.append(img);
      customButton.addEventListener('click', () => {
        selectedIcon = 'custom'; customisationError = ''; renderCustomisationPage();
        post({ type: 'orbitcord-icon-select', icon: 'custom' });
      });
      bindIconContextMenu(customButton, 'custom');
      row.append(customButton);
    }

    const uploadInput = document.createElement('input');
    uploadInput.type = 'file';
    uploadInput.accept = 'image/png,.png';
    uploadInput.id = 'orbitcord-icon-upload-input';
    uploadInput.style.display = 'none';
    uploadInput.addEventListener('change', () => {
      const file = uploadInput.files?.[0];
      if (!file) return;
      if (file.type && file.type !== 'image/png') {
        customisationError = 'PNG only'; renderCustomisationPage(); return;
      }
      if (file.size > 8 * 1024 * 1024) {
        customisationError = 'File too large'; renderCustomisationPage(); return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = String(reader.result || '');
        if (!dataUrl.startsWith('data:image/png;base64,')) {
          customisationError = 'Invalid PNG'; renderCustomisationPage(); return;
        }
        customIconDataUrl = dataUrl;
        selectedIcon = 'custom';
        customisationError = '';
        renderCustomisationPage();
        post({ type: 'orbitcord-icon-upload', fileName: String(file.name || 'custom.png'), dataUrl });
      };
      reader.readAsDataURL(file);
    });

    const upload = create('button', {
      ...buttonStyle(false), minHeight: '40px', height: '40px', padding: '0 14px', whiteSpace: 'nowrap'
    }, 'Upload custom icon');
    upload.type = 'button';
    upload.addEventListener('click', () => uploadInput.click());
    row.append(upload);

    const renameLabel = create('div', {
      marginTop:'28px',marginBottom:'10px',color:'var(--header-secondary,#b5bac1)',fontSize:'12px',fontWeight:'700',textTransform:'uppercase'
    }, 'Nome app');
    const renameRow=create('div',{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'16px',maxWidth:'560px',padding:'14px',borderRadius:'8px',background:'var(--background-secondary,#2b2d31)'});
    const renameCopy=create('div',{minWidth:'0'});
    renameCopy.append(
      create('div',{color:'var(--header-primary,#f2f3f5)',fontWeight:'600',marginBottom:'4px'},displayAppName || formatDisplayAppName(customAppName)),
      create('div',{color:'var(--text-muted,#949ba4)',fontSize:'13px',lineHeight:'18px'},'Il suffisso (OrbitCord) resta sempre. Il rename usa la finestra nativa di OrbitCord.')
    );
    const renameButton=create('button',buttonStyle(true),'Rename app'); renameButton.type='button'; renameButton.id='orbitcord-app-name-rename';
    renameButton.addEventListener('click',event=>{event.preventDefault?.();event.stopPropagation?.();post({type:'orbitcord-app-name-prompt'});});
    renameRow.append(renameCopy,renameButton);

    page.append(title, label, row, uploadInput, renameLabel, renameRow);
    if (customisationError) {
      page.append(create('div', { marginTop: '10px', color: 'var(--text-danger, #f23f42)', fontSize: '13px' }, customisationError));
    }
  }

  function mount() {
    const root = findSettingsRoot();
    if (!root) {
      if (activeEntryKey || recordingId || document.getElementById(PANEL_HOST_ID)) deactivateOrbitPage();
      const staleSection = document.getElementById(SECTION_ID);
      staleSection?.remove?.();
      return;
    }

    const sidebar = findSidebar(root);
    if (!sidebar) return;
    try { window.dispatchEvent(new CustomEvent('orbitcord-settings-opened')); } catch {}
    const section = buildSection(sidebar);
    attachSidebarExitListener(sidebar, section);
    updateTabAppearance();
    if (activeEntryKey) {
      mountActivePage();
      const host = document.getElementById(PANEL_HOST_ID);
      if (host) {
        portalSidebar = sidebar;
        portalRoot = root;
        positionPanelHost(host, sidebar, root);
      }
    }
  }

  function scheduleMount() {
    if (mountScheduled) return;
    mountScheduled = true;
    setTimeout(() => {
      mountScheduled = false;
      mount();
    }, 30);
  }

  webview.addEventListener('message', event => {
    const data = event?.data;
    if (!data) return;
    if (data.type === 'orbitcord-shortcut-recording-state') {
      recordingId = data.active === true ? String(data.id || '') || null : null;
      if (!recordingId) recordingPreviewChord = '';
      if (activeEntryKey === 'shortcut') renderShortcutPage();
      return;
    }
    if (data.type === 'orbitcord-shortcut-recording-preview') {
      if (String(data.id || '') === String(recordingId || '')) {
        recordingPreviewChord = String(data.chord || '');
        if (activeEntryKey === 'shortcut') renderShortcutPage();
      }
      return;
    }
    if (data.type === 'orbitcord-options-state') {
      disableSelfStreamPreview = data.disableSelfStreamPreview === true;
      if (activeEntryKey === 'options') renderOptionsPage();
      return;
    }
    if (data.type === 'orbitcord-customisation-state') {
      selectedIcon = String(data.selectedIcon || 'purple');
      customIconDataUrl = String(data.customIconDataUrl || '');
      customAppName = normalizeCustomAppName(data.customAppName || '');
      displayAppName = String(data.displayAppName || formatDisplayAppName(customAppName));
      customisationError = String(data.error || '');
      iconPresetData.clear();
      for (const preset of Array.isArray(data.presets) ? data.presets : []) {
        if (preset?.id && preset?.dataUrl) iconPresetData.set(String(preset.id), String(preset.dataUrl));
      }
      if (activeEntryKey === 'customisation') renderCustomisationPage();
      return;
    }
    if (data.type === 'orbitcord-shortcut-test-result') {
      lastShortcutStatus = {
        action: String(data.action || ''),
        ok: data.ok === true,
        detail: String(data.detail || '')
      };
      if (activeEntryKey === 'shortcut') renderShortcutPage();
      return;
    }
    if (data.type !== 'orbitcord-shortcuts-state') return;
    const parsedRevision = Number(data.revision);
    const incomingRevision = Number.isFinite(parsedRevision) ? parsedRevision : shortcutRevision + 1;
    if (incomingRevision < shortcutRevision) return;
    shortcutRevision = incomingRevision;
    hookRunning = data.hookRunning === true;
    const hostActions = Array.isArray(data.actions) ? data.actions.map(item => ({
      id: String(item.id || ''),
      name: String(item.name || item.id || ''),
      description: String(item.description || ''),
      isHold: !!item.isHold
    })).filter(item => item.id && CORE_ACTION_IDS.has(item.id)) : [];
    if (hostActions.length) actions = hostActions;

    bindings = (Array.isArray(data.bindings) ? data.bindings : [])
      .map(cloneBinding)
      .filter(binding => CORE_ACTION_IDS.has(binding.action));
    renderShortcutPage();
  });

  function isOrbitCordOwnedTarget(target) {
    return !!target?.closest?.(`#${SECTION_ID}, #${PANEL_HOST_ID}, [data-orbitcord-owned="true"]`);
  }

  function isSettingsNavigationTarget(target) {
    let node = target;
    for (let depth = 0; node && depth < 10; depth++, node = node.parentElement) {
      const label = normalizeText([
        node?.getAttribute?.('aria-label'),
        node?.getAttribute?.('title'),
        node?.textContent
      ].filter(Boolean).join(' ')).trim();
      const classText = normalizeText(node?.className);
      if (/^(user settings|impostazioni utente|settings|impostazioni)$/.test(label)) return true;
      if (/user.?settings|settings.?button|gear.?button/.test(classText)) return true;
      if (/standard.?sidebar.?view|sidebar.?region|content.?region/.test(classText)) return true;
      if (node?.getAttribute?.('data-settings-shell') === 'true') return true;
    }
    return false;
  }

  function isSettingsCloseTarget(target) {
    if (!target?.closest) return false;
    const control = target.closest('button, [role="button"]') || target;
    const label = normalizeText([
      control?.getAttribute?.('aria-label'),
      control?.getAttribute?.('title'),
      control?.getAttribute?.('aria-keyshortcuts'),
      control?.textContent
    ].filter(Boolean).join(' ')).trim();
    const classText = normalizeText([
      control?.className,
      control?.parentElement?.className,
      control?.parentElement?.parentElement?.className
    ].filter(Boolean).join(' '));
    return /^(close|chiudi|esc|escape)$/.test(label)
      || /close settings|chiudi impostazioni|escape/.test(label)
      || /closebutton|close_button|settingsclose|settings_close/.test(classText);
  }

  function isOutsideSettingsRoot(target) {
    if (!activeEntryKey || !portalRoot || !target) return false;
    if (isOrbitCordOwnedTarget(target)) return false;
    try { return !portalRoot.contains?.(target); }
    catch { return false; }
  }

  function isSettingsToolsAreaClick(event) {
    if (!activeEntryKey || !portalRoot) return false;
    const host = document.getElementById(PANEL_HOST_ID);
    if (!host?.getBoundingClientRect || !portalRoot?.getBoundingClientRect) return false;
    const x = Number(event?.clientX);
    const y = Number(event?.clientY);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    try {
      const hostRect = host.getBoundingClientRect();
      const rootRect = portalRoot.getBoundingClientRect();
      return x >= hostRect.right && x <= rootRect.right && y >= rootRect.top && y <= rootRect.bottom;
    } catch { return false; }
  }

  function scheduleMountBurst() {
    for (const timer of mountBurstTimers) clearTimeout(timer);
    mountBurstTimers.clear();

    const delays = [0, 180, 420, 900];
    for (const delay of delays) {
      const timer = setTimeout(() => {
        mountBurstTimers.delete(timer);
        mount();
        const host = document.getElementById(PANEL_HOST_ID);
        if (host && portalSidebar) positionPanelHost(host, portalSidebar, portalRoot);
      }, delay);
      timer?.unref?.();
      mountBurstTimers.add(timer);
    }
  }

  function boot() {
    requestState();
    scheduleMountBurst();

    // Discord settings are opened/navigated through user input. Retrying around
    // those events is cheaper and more deterministic than observing the entire app DOM.
    // OrbitCord-owned clicks must not start a remount burst: action pickers and
    // shortcut controls need to stay completely stable while the user interacts.
    document.addEventListener?.('click', event => {
      const target = event?.target;
      if (isOrbitCordOwnedTarget(target)) return;
      if (activeEntryKey && (isSettingsCloseTarget(target) || isSettingsToolsAreaClick(event) || isOutsideSettingsRoot(target))) {
        deactivateOrbitPage();
        return;
      }
      if (isSettingsNavigationTarget(target)) scheduleMountBurst();
    }, true);
    document.addEventListener?.('keydown', event => {
      if (activeEntryKey && event?.key === 'Escape' && !isOrbitCordOwnedTarget(event?.target)) {
        deactivateOrbitPage();
        return;
      }
      if ((event?.ctrlKey || event?.metaKey) && (event?.code === 'Comma' || event?.key === ',')) scheduleMountBurst();
    }, true);
    window.addEventListener?.('popstate', scheduleMountBurst);
    window.addEventListener?.('hashchange', scheduleMountBurst);
    window.addEventListener?.('resize', () => {
      const host = document.getElementById(PANEL_HOST_ID);
      if (host && portalSidebar) positionPanelHost(host, portalSidebar, portalRoot);
      if (activeEntryKey || document.getElementById(SECTION_ID)) scheduleMount();
    });
  }

  window.addEventListener('pagehide', () => {
    if (recordingId) post({ type: 'orbitcord-shortcut-recording-cancel' });
    recordingId = null;
    recordingPreviewChord = '';
  });

  window.__orbitcordSettingsTest = {
    mount,
    activate: activateShortcutPage,
    deactivate: deactivateOrbitPage,
    activateCustomisation: activateCustomisationPage,
    // Narrow test hooks: keep regression coverage on the recording/host-sync
    // state machine without exposing any user-facing runtime API.
    startRecordingForTest: id => setRecording(id),
    cancelRecordingForTest: () => cancelRecording(),
    removeBindingForTest: id => removeBinding(id),
    getBindingsForTest: () => bindings.map(cloneBinding)
  };

  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})();
