(() => {
  if (window.__orbitcordShortcutActions) return;
  window.__orbitcordShortcutActions = true;

  let webpackRequire = null;
  let audioActions = null;
  let mediaStore = null;
  let mediaStateStore = null;

  const postStatus = (action, ok, detail) => {
    try {
      window.chrome?.webview?.postMessage({
        type: 'orbitcord-shortcut-status', action, ok: !!ok, detail: detail || ''
      });
    } catch {}
  };

  function captureRequireNow() {
    if (webpackRequire?.c) return webpackRequire;
    const runtime = window.__orbitcordDiscordRuntime;
    try {
      const captured = runtime?.captureRequire?.();
      if (captured?.c) return (webpackRequire = captured);
    } catch {}

    const chunk = window.webpackChunkdiscord_app;
    if (!chunk || typeof chunk.push !== 'function') return null;
    try {
      const token = `orbitcord_shortcut_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      chunk.push([[token], {}, req => { if (req?.c) webpackRequire = req; }]);
      try { chunk.pop?.(); } catch {}
    } catch {}
    return webpackRequire;
  }

  function moduleCandidates(module) {
    const exp = module?.exports;
    if (!exp) return [];
    const out = [exp];
    if (exp.default && exp.default !== exp) out.push(exp.default);
    try {
      for (const key of Object.keys(exp)) {
        const value = exp[key];
        if (value && (typeof value === 'object' || typeof value === 'function')) out.push(value);
      }
    } catch {}
    return out;
  }

  function findByPropsFallback(...props) {
    const req = captureRequireNow();
    if (!req?.c) return null;
    try {
      for (const module of Object.values(req.c)) {
        if (module?.loaded === false) continue;
        for (const candidate of moduleCandidates(module)) {
          try {
            if (props.every(prop => candidate?.[prop] !== undefined)) return candidate;
          } catch {}
        }
      }
    } catch {}
    return null;
  }

  function ensureModules() {
    const runtime = window.__orbitcordDiscordRuntime;
    try {
      audioActions ||= runtime?.findByProps?.('toggleSelfMute', 'toggleSelfDeaf') || null;
      mediaStore ||= runtime?.findByProps?.('getMediaEngine', 'getMode') || null;
      mediaStateStore ||= runtime?.findByProps?.('isSelfMute', 'isSelfDeaf') || null;
    } catch {}
    audioActions ||= findByPropsFallback('toggleSelfMute', 'toggleSelfDeaf');
    mediaStore ||= findByPropsFallback('getMediaEngine', 'getMode');
    mediaStateStore ||= findByPropsFallback('isSelfMute', 'isSelfDeaf');
  }

  const normalizeLabel = value => String(value || '')
    .toLowerCase()
    .normalize?.('NFD')
    .replace?.(/[\u0300-\u036f]/g, '') || String(value || '').toLowerCase();

  function controlLabel(element) {
    try {
      return normalizeLabel([
        element?.getAttribute?.('aria-label'),
        element?.getAttribute?.('title'),
        element?.textContent
      ].filter(Boolean).join(' '));
    } catch { return ''; }
  }

  function visibleControl(element) {
    try {
      const rect = element?.getBoundingClientRect?.();
      return !!rect && rect.width > 0 && rect.height > 0 && rect.bottom >= 0 && rect.right >= 0;
    } catch { return true; }
  }

  function discordControls() {
    if (!globalThis.document?.querySelectorAll) return [];
    try {
      return [...document.querySelectorAll('button, [role="button"]')]
        .filter(element => !element?.closest?.('#orbitcord-settings-section, #orbitcord-settings-panel-host, [data-orbitcord-owned="true"]'))
        .filter(visibleControl)
        .map(element => ({
          element,
          label: controlLabel(element),
          ariaLabel: normalizeLabel(element?.getAttribute?.('aria-label'))
        }));
    } catch { return []; }
  }

  function isMuteLabel(label) {
    if (!label) return false;
    if (/deafen|undeafen|headphones|cuffie|disattiva audio|riattiva audio/.test(label)) return false;
    return /\bmute\b|\bunmute\b|microphone|microfono|silenzia|disattiva microfono|riattiva microfono/.test(label);
  }

  function isExactDeafenAriaLabel(label) {
    if (!label) return false;
    return /^(deafen|undeafen|disattiva audio|riattiva audio|disattiva altoparlanti|riattiva altoparlanti)$/.test(label.trim());
  }

  function sortBottomControls(candidates) {
    candidates.sort((a, b) => {
      try {
        const ar = a.element.getBoundingClientRect?.() || {};
        const br = b.element.getBoundingClientRect?.() || {};
        return Number(br.bottom || 0) - Number(ar.bottom || 0) || Number(ar.left || 0) - Number(br.left || 0);
      } catch { return 0; }
    });
    return candidates;
  }

  function clickDiscordVoiceControl(kind) {
    const candidates = discordControls().filter(item => {
      if (kind === 'mute') return isMuteLabel(item.label);
      // Deafen fallback is intentionally stricter than mute: only click a visible
      // Discord-owned button whose aria-label exactly names the voice action.
      // This avoids opening nearby menus/settings that merely contain the word.
      return isExactDeafenAriaLabel(item.ariaLabel);
    });
    const chosen = sortBottomControls(candidates)[0]?.element;
    if (!chosen) return false;
    try { chosen.click?.(); return true; }
    catch { return false; }
  }

  function forEachVoiceConnection(visitor) {
    ensureModules();
    let engine = null;
    try { engine = mediaStore?.getMediaEngine?.() || null; } catch {}
    if (!engine || typeof visitor !== 'function') return 0;

    let visited = 0;
    const seen = new Set();
    const visit = connection => {
      if (!connection || seen.has(connection)) return;
      seen.add(connection);
      visited++;
      try { visitor(connection); } catch {}
    };

    // Do not assume Discord still uses the literal string "default" as the
    // MediaEngine context. Some builds accept the filter argument but simply
    // visit zero connections when it no longer matches, which previously made
    // OrbitCord report audio/media as found while being unable to read state.
    if (typeof engine.eachConnection === 'function') {
      try { engine.eachConnection(visit); } catch {}
      if (visited === 0) {
        try { engine.eachConnection(visit, 'default'); } catch {}
      }
    }

    try {
      const connections = engine.connections;
      if (connections && Symbol.iterator in Object(connections)) {
        for (const connection of connections) {
          if (Array.isArray(connection) && connection.length > 1) visit(connection[1]);
          else visit(connection);
        }
      } else if (connections && typeof connections === 'object') {
        for (const connection of Object.values(connections)) visit(connection);
      }
    } catch {}

    return visited;
  }

  function readVoiceState(kind) {
    ensureModules();

    // The live MediaEngine connection is the closest thing to ground truth.
    // Discord's Flux/store view can lag it by a tick, especially around deafen.
    let observed = null;
    forEachVoiceConnection(connection => {
      if (observed != null) return;
      try {
        const getter = kind === 'mute' ? connection.getSelfMute : connection.getSelfDeaf;
        const property = kind === 'mute' ? connection.selfMute : connection.selfDeaf;
        if (typeof getter === 'function') observed = !!Reflect.apply(getter, connection, []);
        else if (typeof property === 'boolean') observed = property;
      } catch {}
    });
    if (observed != null) return observed;

    // Fall back to the current MediaEngineStore / split state store APIs.
    for (const store of [mediaStore, mediaStateStore]) {
      try {
        const direct = kind === 'mute' ? store?.isSelfMute : store?.isSelfDeaf;
        if (typeof direct === 'function') return !!Reflect.apply(direct, store, []);
        const legacy = kind === 'mute' ? store?.isMute : store?.isDeaf;
        if (typeof legacy === 'function') return !!Reflect.apply(legacy, store, []);
      } catch {}
    }

    try {
      const storeMethod = kind === 'mute' ? mediaStore?.isSelfMute : mediaStore?.isSelfDeaf;
      if (typeof storeMethod === 'function') {
        try { return !!Reflect.apply(storeMethod, mediaStore, []); }
        catch { return !!Reflect.apply(storeMethod, mediaStore, ['default']); }
      }
    } catch {}
    return null;
  }

  const voiceStateDelay = ms => new Promise(resolve => setTimeout(resolve, ms));

  async function waitForVoiceState(kind, predicate, timeoutMs = 450) {
    const deadline = Date.now() + timeoutMs;
    do {
      const state = readVoiceState(kind);
      if (state != null && predicate(state)) return true;
      if (Date.now() >= deadline) break;
      await voiceStateDelay(25);
    } while (true);
    return false;
  }

  async function setVoiceStateViaMediaEngine(kind, wanted) {
    ensureModules();
    let setterCalled = false;
    forEachVoiceConnection(connection => {
      const setter = kind === 'mute' ? connection.setSelfMute : connection.setSelfDeaf;
      if (typeof setter !== 'function') return;
      try {
        Reflect.apply(setter, connection, [!!wanted]);
        setterCalled = true;
      } catch {}
    });
    if (!setterCalled) return false;
    return waitForVoiceState(kind, state => state === !!wanted);
  }

  async function invokeAudioActionVerified(kind, before) {
    ensureModules();
    const action = kind === 'mute' ? audioActions?.toggleSelfMute : audioActions?.toggleSelfDeaf;
    if (typeof action !== 'function') return false;
    try { Reflect.apply(action, audioActions, []); }
    catch {
      try { Reflect.apply(action, audioActions, [{ usedKeybind: true, location: 'OrbitCord Shortcut' }]); }
      catch { return false; }
    }

    // If MediaEngine is temporarily unavailable we still invoke Discord's own
    // action, but we do not claim success without an observable state change.
    if (before == null) return false;
    return waitForVoiceState(kind, state => state !== before);
  }

  async function toggleVoice(kind) {
    ensureModules();
    const before = readVoiceState(kind);

    // Prefer Discord's own voice action. It keeps Discord's UI/Flux state and
    // mute<->deafen coupling consistent. The MediaEngine can publish the new
    // state a few ticks later, so do not immediately cascade into another toggle.
    if (await invokeAudioActionVerified(kind, before)) return true;

    // If Discord's action module is unavailable or did not produce a verified
    // state change, set the live default MediaEngine connection explicitly.
    if (before != null && await setVoiceStateViaMediaEngine(kind, !before)) return true;

    // Final fallback: invoke Discord's own visible voice control. Deafen uses an
    // exact aria-label match, so this cannot guess an adjacent menu/settings item.
    return clickDiscordVoiceControl(kind);
  }

  function unavailableDetail(action) {
    let diagnostics = null;
    try { diagnostics = window.__orbitcordDiscordRuntime?.getDiagnostics?.() || null; } catch {}
    return [
      'action unavailable',
      `action=${String(action || '')}`,
      `webpack=${diagnostics?.mainRequireCaptured ? 'captured' : 'missing'}`,
      `cache=${Number(diagnostics?.cacheSize || 0)}`,
      `audio=${audioActions ? 'found' : 'missing'}`,
      `media=${mediaStore ? 'found' : 'missing'}`,
      `state=${mediaStateStore ? 'found' : 'missing'}`
    ].join('; ');
  }

  async function execute(action, pressed) {
    try {
      if (!pressed) return true;
      let ok = false;
      switch (action) {
        case 'TOGGLE_MUTE': ok = await toggleVoice('mute'); break;
        case 'TOGGLE_DEAFEN': ok = await toggleVoice('deaf'); break;
        default: ok = false; break;
      }
      postStatus(action, ok, ok ? 'verified-state-change' : unavailableDetail(action));
      return ok;
    } catch (error) {
      postStatus(action, false, String(error?.message || error));
      return false;
    }
  }

  try {
    window.chrome?.webview?.addEventListener('message', event => {
      const data = event?.data;
      if (!data || data.type !== 'orbitcord-shortcut-execute') return;
      void execute(String(data.action || ''), !!data.pressed);
    });
  } catch {}

  window.__orbitcordShortcutActionsTest = { execute, ensureModules, captureRequireNow };
})();
