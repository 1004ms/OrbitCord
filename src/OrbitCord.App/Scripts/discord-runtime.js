(() => {
  if (window.__orbitcordDiscordRuntime?.installed) return;

  let webpackRequire = null;
  let chunkValue;
  let chunkHookInstalled = false;
  let functionMHookInstalled = false;
  const propCache = new Map();

  const diagnostic = {
    mainRequireCaptured: false,
    chunkHookInstalled: false,
    functionMHookInstalled: false,
    lastCapture: 'not-captured'
  };

  function setWebpackRequire(req, reason) {
    if (!req || (typeof req !== 'function' && typeof req !== 'object')) return false;
    webpackRequire = req;
    propCache.clear();
    diagnostic.mainRequireCaptured = true;
    diagnostic.lastCapture = String(reason || 'unknown');
    return true;
  }

  function installRequirePathProbe(req) {
    if (!req || (typeof req !== 'function' && typeof req !== 'object')) return false;
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(req, 'p'); } catch { return false; }

    if (descriptor?.value === '/assets/') setWebpackRequire(req, 'require.p-existing');
    if (descriptor && descriptor.configurable === false) return descriptor.value === '/assets/';
    if (descriptor?.get || descriptor?.set) {
      try { if (req.p === '/assets/') setWebpackRequire(req, 'require.p-accessor-existing'); } catch {}
      return false;
    }

    let value = descriptor?.value;
    try {
      Object.defineProperty(req, 'p', {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() { return value; },
        set(next) {
          value = next;
          if (next === '/assets/') setWebpackRequire(req, 'require.p=/assets/');
        }
      });
      if (value === '/assets/') setWebpackRequire(req, 'require.p-existing');
      return true;
    } catch { return false; }
  }

  function installFunctionMHook() {
    if (functionMHookInstalled) return true;
    let prototype;
    try { prototype = Object.getPrototypeOf(function () {}); } catch { return false; }
    if (!prototype) return false;

    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(prototype, 'm'); } catch {}
    if (descriptor && descriptor.configurable === false) return false;

    const originalGet = descriptor?.get;
    const originalSet = descriptor?.set;
    try {
      Object.defineProperty(prototype, 'm', {
        configurable: true,
        enumerable: descriptor?.enumerable ?? false,
        get() {
          if (originalGet) {
            try { return originalGet.call(this); } catch {}
          }
          return undefined;
        },
        set(value) {
          if (originalSet) {
            try { originalSet.call(this, value); } catch {}
          }
          try {
            Object.defineProperty(this, 'm', {
              value,
              configurable: true,
              enumerable: true,
              writable: true
            });
          } catch { return; }
          installRequirePathProbe(this);
        }
      });
      functionMHookInstalled = true;
      diagnostic.functionMHookInstalled = true;
      return true;
    } catch { return false; }
  }

  function patchChunkPush(chunk) {
    if (!chunk || typeof chunk.push !== 'function') return chunk;
    try { if (chunk.__orbitcordRuntimeWrapped === true) return chunk; } catch {}
    try {
      let originalPush = chunk.push;
      const handlePush = function (entry) {
        return Reflect.apply(originalPush, chunk, [entry]);
      };
      handlePush.toString = () => {
        try { return originalPush.toString(); } catch { return 'function push() { [native code] }'; }
      };
      handlePush.bind = (...args) => originalPush.bind(...args);
      Object.defineProperty(chunk, 'push', {
        configurable: true,
        enumerable: false,
        get: () => handlePush,
        set(value) { if (typeof value === 'function') originalPush = value; }
      });
      Object.defineProperty(chunk, '__orbitcordRuntimeWrapped', { value: true, configurable: true });
    } catch {}
    return chunk;
  }

  function installChunkHook() {
    if (chunkHookInstalled) return true;
    const key = 'webpackChunkdiscord_app';
    let descriptor;
    try { descriptor = Object.getOwnPropertyDescriptor(window, key); } catch {}
    if (descriptor && descriptor.configurable === false) return false;

    const originalGet = descriptor?.get;
    const originalSet = descriptor?.set;
    try {
      chunkValue = originalGet ? originalGet.call(window) : descriptor?.value;
      chunkValue = patchChunkPush(chunkValue);
      Object.defineProperty(window, key, {
        configurable: true,
        enumerable: descriptor?.enumerable ?? true,
        get() {
          if (originalGet) {
            try { chunkValue = patchChunkPush(originalGet.call(window)); } catch {}
          }
          return chunkValue;
        },
        set(value) {
          if (originalSet) {
            try { originalSet.call(window, value); } catch {}
            if (originalGet) {
              try { value = originalGet.call(window); } catch {}
            }
          }
          chunkValue = patchChunkPush(value);
        }
      });
      chunkHookInstalled = true;
      diagnostic.chunkHookInstalled = true;
      return true;
    } catch { return false; }
  }

  function captureRequire() {
    if (webpackRequire?.c) return webpackRequire;
    const chunk = window.webpackChunkdiscord_app;
    if (!chunk || typeof chunk.push !== 'function') return webpackRequire;
    try {
      const token = `orbitcord_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      chunk.push([[token], {}, req => {
        if (!req) return;
        installRequirePathProbe(req);
        if (req.p === '/assets/' || (!webpackRequire && req.c)) {
          setWebpackRequire(req, req.p === '/assets/' ? 'synthetic-main' : 'synthetic-cache');
        }
      }]);
      try { chunk.pop?.(); } catch {}
    } catch {}
    return webpackRequire;
  }

  function candidates(module) {
    const exp = module?.exports;
    if (!exp) return [];
    const out = [exp];
    if (exp.default && exp.default !== exp) out.push(exp.default);
    try {
      for (const key of Object.keys(exp)) {
        if (key.length > 3) continue;
        const value = exp[key];
        if (value && (typeof value === 'object' || typeof value === 'function')) out.push(value);
      }
    } catch {}
    return out;
  }

  function findByProps(...props) {
    const cacheKey = props.slice().sort().join('|');
    const cached = propCache.get(cacheKey);
    if (cached && props.every(prop => cached?.[prop] !== undefined)) return cached;

    const req = captureRequire();
    if (!req?.c) return null;
    for (const module of Object.values(req.c)) {
      if (module?.loaded === false) continue;
      for (const value of candidates(module)) {
        try {
          if (props.every(prop => value?.[prop] !== undefined)) {
            propCache.set(cacheKey, value);
            return value;
          }
        } catch {}
      }
    }
    return null;
  }

  installFunctionMHook();
  installChunkHook();

  window.__orbitcordDiscordRuntime = {
    installed: true,
    captureRequire,
    findByProps,
    getDiagnostics: () => ({
      ...diagnostic,
      cacheSize: webpackRequire?.c ? Object.keys(webpackRequire.c).length : 0
    })
  };
})();
