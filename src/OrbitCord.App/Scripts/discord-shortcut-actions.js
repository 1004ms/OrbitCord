(() => {
  if (window.__orbitcordShortcutActions) return;
  window.__orbitcordShortcutActions = true;

  let webpackRequire = null;
  let audioActions = null;
  let mediaStore = null;

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
    } catch {}
    audioActions ||= findByPropsFallback('toggleSelfMute', 'toggleSelfDeaf');
    mediaStore ||= findByPropsFallback('getMediaEngine', 'getMode');
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
        .map(element => ({ element, label: controlLabel(element) }));
    } catch { return []; }
  }

  function isMuteLabel(label) {
    if (!label) return false;
    if (/deafen|undeafen|headphones|cuffie|disattiva audio|riattiva audio/.test(label)) return false;
    return /\bmute\b|\bunmute\b|microphone|microfono|silenzia|disattiva microfono|riattiva microfono/.test(label);
  }

  function isDeafenLabel(label) {
    return !!label && /deafen|undeafen|headphones|cuffie|disattiva audio|riattiva audio/.test(label);
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
    const candidates = discordControls().filter(item => kind === 'mute' ? isMuteLabel(item.label) : isDeafenLabel(item.label));
    const chosen = sortBottomControls(candidates)[0]?.element;
    if (!chosen) return false;
    try { chosen.click?.(); return true; }
    catch { return false; }
  }

  function readVoiceState(kind) {
    ensureModules();

    // Discord's Flux/media store can lag the live voice connection by a tick.
    // Read the MediaEngine connection first so verification reflects the state
    // that setSelfMute/setSelfDeaf actually changed.
    let engine = null;
    try { engine = mediaStore?.getMediaEngine?.() || null; } catch {}
    let observed = null;
    const inspect = connection => {
      if (observed != null || !connection || (connection.context && connection.context !== 'default')) return;
      try {
        const getter = kind === 'mute' ? connection.getSelfMute : connection.getSelfDeaf;
        const property = kind === 'mute' ? connection.selfMute : connection.selfDeaf;
        if (typeof getter === 'function') observed = !!Reflect.apply(getter, connection, []);
        else if (typeof property === 'boolean') observed = property;
      } catch {}
    };
    if (typeof engine?.eachConnection === 'function') {
      try { engine.eachConnection(inspect, 'default'); }
      catch { try { engine.eachConnection(inspect); } catch {} }
    } else if (engine?.connections && Symbol.iterator in Object(engine.connections)) {
      for (const connection of engine.connections) inspect(connection);
    }
    if (observed != null) return observed;

    try {
      const storeMethod = kind === 'mute' ? mediaStore?.isSelfMute : mediaStore?.isSelfDeaf;
      if (typeof storeMethod === 'function') return !!Reflect.apply(storeMethod, mediaStore, ['default']);
    } catch {}
    return null;
  }

  function setVoiceStateViaMediaEngine(kind, wanted) {
    ensureModules();
    let engine;
    try { engine = mediaStore?.getMediaEngine?.(); } catch { return false; }
    if (!engine) return false;
    let setterCalled = false;
    const apply = connection => {
      if (!connection || (connection.context && connection.context !== 'default')) return;
      const setter = kind === 'mute' ? connection.setSelfMute : connection.setSelfDeaf;
      if (typeof setter !== 'function') return;
      try {
        Reflect.apply(setter, connection, [!!wanted]);
        setterCalled = true;
      } catch {}
    };
    if (typeof engine.eachConnection === 'function') {
      try { engine.eachConnection(apply, 'default'); }
      catch { try { engine.eachConnection(apply); } catch {} }
    } else if (engine.connections && Symbol.iterator in Object(engine.connections)) {
      for (const connection of engine.connections) apply(connection);
    }
    if (!setterCalled) return false;
    const after = readVoiceState(kind);
    return after == null ? false : after === !!wanted;
  }

  function toggleVoiceStateViaMediaEngine(kind) {
    const before = readVoiceState(kind);
    if (before == null) return false;
    return setVoiceStateViaMediaEngine(kind, !before);
  }

  function invokeAudioActionVerified(kind) {
    ensureModules();
    const before = readVoiceState(kind);
    const action = kind === 'mute' ? audioActions?.toggleSelfMute : audioActions?.toggleSelfDeaf;
    if (typeof action !== 'function') return false;
    try { Reflect.apply(action, audioActions, [{ usedKeybind: true, location: 'OrbitCord Shortcut' }]); }
    catch { try { Reflect.apply(action, audioActions, []); } catch { return false; } }
    const after = readVoiceState(kind);
    return before != null && after != null && after !== before;
  }

  function toggleVoice(kind) {
    if (toggleVoiceStateViaMediaEngine(kind)) return true;
    if (invokeAudioActionVerified(kind)) return true;
    return clickDiscordVoiceControl(kind === 'mute' ? 'mute' : 'deafen');
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
      `media=${mediaStore ? 'found' : 'missing'}`
    ].join('; ');
  }

  function execute(action, pressed) {
    try {
      if (!pressed) return true;
      let ok = false;
      switch (action) {
        case 'TOGGLE_MUTE': ok = toggleVoice('mute'); break;
        case 'TOGGLE_DEAFEN': ok = toggleVoice('deaf'); break;
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
      execute(String(data.action || ''), !!data.pressed);
    });
  } catch {}

  window.__orbitcordShortcutActionsTest = { execute, ensureModules, captureRequireNow };
})();
