using System.ComponentModel;
using System.Runtime.InteropServices;

namespace OrbitCord.App;

internal sealed class NativeShortcutService : IDisposable
{
    private const int WhKeyboardLl = 13;
    private const int WmKeyDown = 0x0100;
    private const int WmKeyUp = 0x0101;
    private const int WmSysKeyDown = 0x0104;
    private const int WmSysKeyUp = 0x0105;
    private const uint LlkhfInjected = 0x10;

    private readonly LowLevelKeyboardProc _callback;
    private readonly Func<bool> _shouldSuppressForegroundMatch;
    private readonly HashSet<int> _rawPressed = [];
    private readonly HashSet<int> _suppressedRawKeys = [];
    private readonly HashSet<Guid> _activeHoldBindings = [];
    private readonly HashSet<int> _recordingKeys = [];
    private List<ShortcutBinding> _bindings = [];
    private IntPtr _hook;
    private bool _disposed;
    private Guid? _recordingBindingId;

    public event Action<ShortcutAction, bool>? ActionTriggered;
    public event Action<Guid, IReadOnlyList<int>>? RecordingPreview;
    public event Action<Guid, IReadOnlyList<int>>? RecordingCompleted;
    public event Action<Guid?>? RecordingStateChanged;

    public bool IsRunning => _hook != IntPtr.Zero;
    public bool IsRecording => _recordingBindingId.HasValue;
    public Guid? RecordingBindingId => _recordingBindingId;

    public NativeShortcutService(Func<bool> shouldSuppressForegroundMatch)
    {
        _shouldSuppressForegroundMatch = shouldSuppressForegroundMatch;
        _callback = HookCallback;
    }

    public void Start(IEnumerable<ShortcutBinding> bindings)
    {
        ThrowIfDisposed();
        Reload(bindings);
        if (_hook != IntPtr.Zero) return;

        var module = GetModuleHandle(null);
        _hook = SetWindowsHookEx(WhKeyboardLl, _callback, module, 0);
        if (_hook == IntPtr.Zero)
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Could not install OrbitCord global shortcut hook.");
    }

    public void Reload(IEnumerable<ShortcutBinding> bindings)
    {
        ThrowIfDisposed();
        ReleaseAllHolds();
        _bindings = bindings
            .Where(x => x.Enabled && ShortcutBindingPolicy.IsAllowed(x.VirtualKeys))
            .Select(x => x.Clone())
            .ToList();
    }

    public void BeginRecording(Guid bindingId)
    {
        ThrowIfDisposed();
        if (bindingId == Guid.Empty) return;

        ReleaseAllHolds();
        _rawPressed.Clear();
        _suppressedRawKeys.Clear();
        _recordingKeys.Clear();
        _recordingBindingId = bindingId;
        RecordingStateChanged?.Invoke(bindingId);
        RecordingPreview?.Invoke(bindingId, Array.Empty<int>());
    }

    public void CancelRecording()
    {
        ThrowIfDisposed();
        if (!_recordingBindingId.HasValue) return;

        _recordingBindingId = null;
        _recordingKeys.Clear();
        _rawPressed.Clear();
        _suppressedRawKeys.Clear();
        RecordingStateChanged?.Invoke(null);
    }

    private IntPtr HookCallback(int nCode, IntPtr wParam, IntPtr lParam)
    {
        if (nCode < 0 || _disposed)
            return CallNextHookEx(_hook, nCode, wParam, lParam);

        var data = Marshal.PtrToStructure<KbdLlHookStruct>(lParam);
        if ((data.flags & LlkhfInjected) != 0)
            return CallNextHookEx(_hook, nCode, wParam, lParam);

        var message = unchecked((int)(long)wParam);
        var rawVk = unchecked((int)data.vkCode);

        if (IsRecording)
            return HandleRecordingInput(message, rawVk, nCode, wParam, lParam);

        if (message is WmKeyDown or WmSysKeyDown)
        {
            var firstPress = _rawPressed.Add(rawVk);
            if (!firstPress)
            {
                return _suppressedRawKeys.Contains(rawVk)
                    ? new IntPtr(1)
                    : CallNextHookEx(_hook, nCode, wParam, lParam);
            }

            var current = CurrentNormalizedKeys();
            var foreground = _shouldSuppressForegroundMatch();
            var matches = _bindings
                .Where(binding => ChordEquals(binding.VirtualKeys, current))
                .ToArray();

            if (matches.Length > 0)
            {
                foreach (var binding in matches)
                {
                    var info = ShortcutCatalog.Get(binding.Action);
                    if (info.IsHold)
                    {
                        if (_activeHoldBindings.Add(binding.Id))
                            ActionTriggered?.Invoke(binding.Action, true);
                    }
                    else
                    {
                        ActionTriggered?.Invoke(binding.Action, true);
                    }
                }

                if (foreground)
                {
                    _suppressedRawKeys.Add(rawVk);
                    return new IntPtr(1);
                }
            }
        }
        else if (message is WmKeyUp or WmSysKeyUp)
        {
            _rawPressed.Remove(rawVk);
            var current = CurrentNormalizedKeys();

            foreach (var binding in _bindings.Where(x => _activeHoldBindings.Contains(x.Id)).ToArray())
            {
                if (!ChordContained(binding.VirtualKeys, current))
                {
                    _activeHoldBindings.Remove(binding.Id);
                    ActionTriggered?.Invoke(binding.Action, false);
                }
            }

            if (_suppressedRawKeys.Remove(rawVk))
                return new IntPtr(1);
        }

        return CallNextHookEx(_hook, nCode, wParam, lParam);
    }

    private IntPtr HandleRecordingInput(int message, int rawVk, int nCode, IntPtr wParam, IntPtr lParam)
    {
        var bindingId = _recordingBindingId;
        if (!bindingId.HasValue)
            return CallNextHookEx(_hook, nCode, wParam, lParam);

        if (message is WmKeyDown or WmSysKeyDown)
        {
            if (_rawPressed.Add(rawVk))
            {
                _recordingKeys.Add(NativeKeyCode.Normalize(rawVk));
                RecordingPreview?.Invoke(bindingId.Value, SortedChord(_recordingKeys));
            }
            return new IntPtr(1);
        }

        if (message is WmKeyUp or WmSysKeyUp)
        {
            _rawPressed.Remove(rawVk);
            if (_rawPressed.Count == 0)
            {
                var chord = SortedChord(_recordingKeys);
                if (ShortcutBindingPolicy.IsAllowed(chord))
                {
                    _recordingBindingId = null;
                    _recordingKeys.Clear();
                    RecordingStateChanged?.Invoke(null);
                    RecordingCompleted?.Invoke(bindingId.Value, chord);
                }
                else
                {
                    // A modifier-only press is not a completed shortcut. Reset
                    // the attempt and keep recording until a real key is used.
                    _recordingKeys.Clear();
                    RecordingPreview?.Invoke(bindingId.Value, Array.Empty<int>());
                }
            }
            return new IntPtr(1);
        }

        return new IntPtr(1);
    }

    private HashSet<int> CurrentNormalizedKeys() =>
        _rawPressed.Select(NativeKeyCode.Normalize).ToHashSet();

    private static IReadOnlyList<int> SortedChord(IEnumerable<int> keys) =>
        keys
            .Select(NativeKeyCode.Normalize)
            .Where(vk => vk > 0)
            .Distinct()
            .OrderBy(NativeKeyCode.SortKey)
            .ToArray();

    private static bool ChordEquals(IReadOnlyCollection<int> chord, HashSet<int> current)
    {
        if (chord.Count != current.Count) return false;
        return chord.All(current.Contains);
    }

    private static bool ChordContained(IEnumerable<int> chord, HashSet<int> current) =>
        chord.All(current.Contains);

    private void ReleaseAllHolds()
    {
        foreach (var binding in _bindings.Where(x => _activeHoldBindings.Contains(x.Id)).ToArray())
            ActionTriggered?.Invoke(binding.Action, false);
        _activeHoldBindings.Clear();
        _rawPressed.Clear();
        _suppressedRawKeys.Clear();
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        ReleaseAllHolds();
        _recordingBindingId = null;
        _recordingKeys.Clear();
        if (_hook != IntPtr.Zero)
        {
            UnhookWindowsHookEx(_hook);
            _hook = IntPtr.Zero;
        }
    }

    private void ThrowIfDisposed()
    {
        ObjectDisposedException.ThrowIf(_disposed, this);
    }

    private delegate IntPtr LowLevelKeyboardProc(int nCode, IntPtr wParam, IntPtr lParam);

    [StructLayout(LayoutKind.Sequential)]
    private struct KbdLlHookStruct
    {
        public uint vkCode;
        public uint scanCode;
        public uint flags;
        public uint time;
        public UIntPtr dwExtraInfo;
    }

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SetWindowsHookEx(int idHook, LowLevelKeyboardProc lpfn, IntPtr hMod, uint dwThreadId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool UnhookWindowsHookEx(IntPtr hhk);

    [DllImport("user32.dll")]
    private static extern IntPtr CallNextHookEx(IntPtr hhk, int nCode, IntPtr wParam, IntPtr lParam);

    [DllImport("kernel32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr GetModuleHandle(string? lpModuleName);
}
