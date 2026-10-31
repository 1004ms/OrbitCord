# OrbitCord keyboard shortcuts

OrbitCord uses a native Windows keyboard hook for both global shortcut execution and shortcut recording.
The WebView is deliberately not a keyboard recorder: it only renders shortcut state and sends granular commands to the native host.

## Why `WH_KEYBOARD_LL`

The shortcut UI must support normal single keys (for example `N` or `F8`) and combinations with optional modifiers, while also being able to swallow keystrokes during recording so they do not type into Discord or trigger an existing binding.

`RegisterHotKey` was not used because the Win32 API models a hotkey as modifier flags plus one virtual key, and Windows reserves some Win-key combinations. Raw Input can receive keyboard input in the background with `RIDEV_INPUTSINK`, but it is primarily an observation path and does not fit OrbitCord's selective suppression requirement during recording as directly as the low-level keyboard hook.

References:
- Microsoft Learn — LowLevelKeyboardProc: https://learn.microsoft.com/windows/win32/winmsg/lowlevelkeyboardproc
- Microsoft Learn — KBDLLHOOKSTRUCT: https://learn.microsoft.com/windows/win32/api/winuser/ns-winuser-kbdllhookstruct
- Microsoft Learn — RegisterHotKey: https://learn.microsoft.com/windows/win32/api/winuser/nf-winuser-registerhotkey
- Microsoft Learn — Raw Input overview: https://learn.microsoft.com/windows/win32/inputdev/about-raw-input

## Recording contract

1. Clicking `Imposta tasti` sends `orbitcord-shortcut-recording-begin` with the binding ID.
2. `NativeShortcutService` enters recording mode. Existing shortcut execution is disabled for the duration of the recording.
3. Native keydown events are accumulated as Windows virtual-key codes. Auto-repeat does not duplicate keys.
4. Captured native keyboard events are swallowed while recording, so they are not delivered to the WebView or the previous shortcut action.
5. The old binding remains unchanged while the new chord is only a preview.
6. Once all captured keys are released, a chord containing at least one non-modifier key is completed and persisted atomically.
7. Modifier-only attempts are cleared and recording continues.
8. Canceling recording never changes the previous binding.
9. If the OrbitCord window loses focus while recording, the native host cancels capture as a fail-safe.

Escape is not reserved as a hidden cancel key. It can therefore be used as an ordinary shortcut key. Cancellation is an explicit UI action.

## State ownership

The native host owns the shortcut list. The WebView never sends a full replacement list. Mutations are granular:

- `orbitcord-shortcut-create`
- `orbitcord-shortcut-delete`
- `orbitcord-shortcut-action`
- `orbitcord-shortcut-enabled`
- `orbitcord-shortcut-recording-begin`
- `orbitcord-shortcut-recording-cancel`

Every canonical shortcut snapshot has a monotonic `revision`. The WebView ignores snapshots older than the latest one it has already accepted, preventing delayed messages from removing or resurrecting bindings.

## Foreground execution

A valid saved shortcut executes regardless of whether OrbitCord is foreground or background. This is deliberate: the settings page must be able to test the same binding that will be used in a game, and single-key bindings such as `N`, `F8` or `Space` must not become silently inactive just because the OrbitCord window currently has focus.

When a binding matches while OrbitCord is foreground, the matching terminal key event is suppressed so the same keystroke is not also typed into the WebView. When OrbitCord is in the background, the global shortcut executes without swallowing the game's key event. Recording mode remains separate and swallows every captured keyboard event until the attempt completes or is cancelled.

Injected keyboard input is ignored by the native hook.

## Mute / deafen execution

Mute keeps the verified Discord runtime path already used by OrbitCord because it is reliable on the current web client. Deafen now has a stronger native-first path: OrbitCord sends Discord's documented Windows shortcut `Ctrl+Shift+D` directly to the WebView through `Input.dispatchKeyEvent` on the Chrome DevTools Protocol. The host emits explicit Control, Shift and D key transitions and awaits each CDP call in order. This routes the action through Discord's own keyboard handling without depending on private webpack symbol names or DOM labels.

If the WebView2 runtime cannot dispatch the built-in shortcut, OrbitCord falls back to the existing Discord voice action / MediaEngine logic. The live MediaEngine connection is treated as authoritative because Discord's Flux/store view can lag by a tick. As a final defensive fallback, deafen may use only a visible Discord-owned control whose `aria-label` exactly names Deafen/Undeafen (including the supported Italian equivalents). OrbitCord-owned settings controls and unlabeled neighbouring buttons are never eligible.

References:
- Discord Support — Windows deafen shortcut (`Ctrl+Shift+D`): https://support.discord.com/hc/en-us/articles/225977308--Windows-Discord-Hotkeys
- Microsoft WebView2 — `CoreWebView2.CallDevToolsProtocolMethodAsync`: https://learn.microsoft.com/dotnet/api/microsoft.web.webview2.core.corewebview2.calldevtoolsprotocolmethodasync
- Chrome DevTools Protocol — Input domain: https://chromedevtools.github.io/devtools-protocol/tot/Input/
