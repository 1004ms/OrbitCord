(() => {
  if (window.__orbitcordOptionsRuntime) return;
  window.__orbitcordOptionsRuntime = true;

  const webview = window.chrome?.webview;
  if (!webview) return;

  let disableSelfStreamPreview = false;
  const captureTracks = new Set();
  const captureStreams = new Set();
  const suppressedVideos = new Set();
  const savedVideoState = new WeakMap();

  function getTracks(stream) {
    try { return typeof stream?.getTracks === 'function' ? stream.getTracks() : []; }
    catch { return []; }
  }

  function getVideoTracks(stream) {
    try {
      if (typeof stream?.getVideoTracks === 'function') return stream.getVideoTracks();
      return getTracks(stream).filter(track => track?.kind === 'video');
    } catch { return []; }
  }

  function isDisplayCaptureTrack(track) {
    if (!track) return false;
    if (captureTracks.has(track)) return true;
    try {
      const settings = track.getSettings?.();
      return !!settings?.displaySurface;
    } catch { return false; }
  }

  function registerCaptureStream(stream) {
    if (!stream) return stream;
    captureStreams.add(stream);
    for (const track of getTracks(stream)) {
      captureTracks.add(track);
      try {
        track.addEventListener?.('ended', () => {
          captureTracks.delete(track);
          if (captureTracks.size === 0) restoreAllPreviews();
          else scanPreviews();
        }, { once: true });
      } catch {}
    }
    if (disableSelfStreamPreview) queueMicrotask(scanPreviews);
    return stream;
  }

  function videoUsesLocalCapture(video) {
    const stream = video?.srcObject;
    if (!stream) return false;
    if (captureStreams.has(stream)) return true;
    return getVideoTracks(stream).some(isDisplayCaptureTrack);
  }

  function suppressPreview(video) {
    if (!video || suppressedVideos.has(video)) return;
    const style = video.style || {};
    savedVideoState.set(video, {
      visibility: style.visibility ?? '',
      opacity: style.opacity ?? '',
      pointerEvents: style.pointerEvents ?? '',
      contentVisibility: style.contentVisibility ?? '',
      wasPaused: !!video.paused
    });
    suppressedVideos.add(video);
    try { video.pause?.(); } catch {}
    try {
      style.visibility = 'hidden';
      style.opacity = '0';
      style.pointerEvents = 'none';
      style.contentVisibility = 'hidden';
    } catch {}
  }

  function restorePreview(video) {
    if (!video || !suppressedVideos.has(video)) return;
    const previous = savedVideoState.get(video);
    suppressedVideos.delete(video);
    savedVideoState.delete(video);
    if (!previous) return;
    try {
      const style = video.style || {};
      style.visibility = previous.visibility;
      style.opacity = previous.opacity;
      style.pointerEvents = previous.pointerEvents;
      style.contentVisibility = previous.contentVisibility;
    } catch {}
    if (!previous.wasPaused) {
      try {
        const result = video.play?.();
        result?.catch?.(() => {});
      } catch {}
    }
  }

  function restoreAllPreviews() {
    for (const video of [...suppressedVideos]) restorePreview(video);
  }

  function scanPreviews() {
    if (!disableSelfStreamPreview) {
      restoreAllPreviews();
      return;
    }

    let videos = [];
    try { videos = [...(document.querySelectorAll?.('video') || [])]; } catch {}
    for (const video of videos) {
      if (videoUsesLocalCapture(video)) suppressPreview(video);
      else if (suppressedVideos.has(video)) restorePreview(video);
    }

    for (const video of [...suppressedVideos]) {
      if (video?.isConnected === false) restorePreview(video);
    }
  }

  function applyOptions(next) {
    disableSelfStreamPreview = !!next?.disableSelfStreamPreview;
    scanPreviews();
  }

  // Chromium can filter audio produced by the capturing page from system-audio capture.
  // Discord remote voices play inside this page, so forcing this constraint prevents them
  // from being sent back into the screen-share stream as echo.
  function withOwnAudioRestriction(args) {
    if (!Array.isArray(args) || args.length === 0) return args;
    const options = args[0];
    if (!options || typeof options !== 'object' || !options.audio) return args;

    const audio = options.audio === true
      ? { restrictOwnAudio: true }
      : (typeof options.audio === 'object'
          ? { ...options.audio, restrictOwnAudio: true }
          : options.audio);

    if (audio === options.audio) return args;
    return [{ ...options, audio }, ...args.slice(1)];
  }

  function installDisplayCaptureHook() {
    const mediaDevices = navigator?.mediaDevices;
    const original = mediaDevices?.getDisplayMedia;
    if (typeof original !== 'function' || original.__orbitcordWrapped) return;

    const wrapped = async function(...args) {
      const stream = await Reflect.apply(original, this, withOwnAudioRestriction(args));
      registerCaptureStream(stream);
      return stream;
    };
    try { Object.defineProperty(wrapped, '__orbitcordWrapped', { value: true }); } catch {}

    try {
      mediaDevices.getDisplayMedia = wrapped;
    } catch {
      try {
        Object.defineProperty(mediaDevices, 'getDisplayMedia', {
          configurable: true,
          writable: true,
          value: wrapped
        });
      } catch {}
    }
  }

  try {
    webview.addEventListener('message', event => {
      const data = event?.data;
      if (data?.type === 'orbitcord-options-state') applyOptions(data);
    });
  } catch {}

  try {
    document.addEventListener?.('loadedmetadata', event => {
      if (disableSelfStreamPreview && event?.target?.tagName?.toLowerCase?.() === 'video') scanPreviews();
    }, true);
    document.addEventListener?.('playing', event => {
      if (disableSelfStreamPreview && event?.target?.tagName?.toLowerCase?.() === 'video') scanPreviews();
    }, true);
  } catch {}

  try {
    const observer = new MutationObserver(() => {
      if (disableSelfStreamPreview) queueMicrotask(scanPreviews);
    });
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    else document.addEventListener?.('DOMContentLoaded', () => observer.observe(document.body, { childList: true, subtree: true }), { once: true });
  } catch {}

  installDisplayCaptureHook();
  try { webview.postMessage({ type: 'orbitcord-options-request' }); } catch {}

  window.__orbitcordOptionsTest = {
    registerCaptureStream,
    applyOptions,
    scanPreviews,
    videoUsesLocalCapture
  };
})();
