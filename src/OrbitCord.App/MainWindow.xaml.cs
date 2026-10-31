using System.Diagnostics;
using System.IO;
using System.Text.Json;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media.Imaging;
using System.Windows.Threading;
using OrbitCord.Core;
using Microsoft.Web.WebView2.Core;

namespace OrbitCord.App;

public partial class MainWindow : Window
{
    private readonly FileLogger _logger;
    private CoreWebView2Environment? _environment;
    private bool _gamingMode;
    private bool _ultraLiteMode;
    private readonly ShortcutStore _shortcutStore = new();
    private readonly IconCustomizationStore _iconCustomizationStore = new();
    private readonly OptionsStore _optionsStore = new();
    private readonly NativeShortcutService _nativeShortcuts;
    private List<ShortcutBinding> _shortcuts;
    private long _shortcutRevision;
    private CancellationTokenSource? _toastCts;
    private CancellationTokenSource? _startupMemoryCts;
    private readonly DispatcherTimer _memoryGovernorTimer = new() { Interval = TimeSpan.FromSeconds(8) };
    private readonly DispatcherTimer _performanceDiagnosticsTimer = new() { Interval = TimeSpan.FromSeconds(1) };
    private const int MaxPerformanceDiagnosticSamples = 10_000;
    private static bool PerformanceDiagnosticsEnabled
        => string.Equals(Environment.GetEnvironmentVariable("ORBITCORD_PERF_DIAGNOSTICS"), "1", StringComparison.OrdinalIgnoreCase)
            || string.Equals(Environment.GetEnvironmentVariable("ORBITCORD_PERF_DIAGNOSTICS"), "true", StringComparison.OrdinalIgnoreCase);
    private readonly object _performanceDiagnosticsGate = new();
    private readonly List<PerformanceDiagnosticsSample> _performanceDiagnosticsSamples = [];
    private readonly DateTimeOffset _performanceDiagnosticsStartedUtc = DateTimeOffset.UtcNow;
    private bool _performanceDiagnosticsSteadyCadence;
    private DateTimeOffset _lastMemoryCleanupUtc = DateTimeOffset.MinValue;
    private long _lastMemoryCleanupWorkingSetBytes;
    private bool _startupMemorySettled;
    private bool _memoryGovernorBusy;

    private static string UserDataFolder => Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "OrbitCord",
        "WebView2");

    public MainWindow(FileLogger logger)
    {
        _logger = logger;
        InitializeComponent();
        ApplySelectedWindowIcon();
        ApplySelectedAppName();
        _shortcuts = _shortcutStore.Load().Select(x => x.Clone()).ToList();
        _nativeShortcuts = new NativeShortcutService(() => IsActive);
        _nativeShortcuts.ActionTriggered += OnNativeShortcutAction;
        _nativeShortcuts.RecordingStateChanged += OnNativeShortcutRecordingStateChanged;
        _nativeShortcuts.RecordingPreview += OnNativeShortcutRecordingPreview;
        _nativeShortcuts.RecordingCompleted += OnNativeShortcutRecordingCompleted;
        SourceInitialized += (_, _) =>
        {
            // Keep SourceInitialized lean. WPF already received the selected title/icon before
            // the native handle existed; shell shortcut enumeration is deferred until startup
            // has completed so customisation can never kill the preload window.
            NativeWindowStyling.ApplyOrbitCordTitleBar(this);
            ApplySelectedAppName();
            StartNativeShortcuts();
        };
        DiscordView.DefaultBackgroundColor = System.Drawing.Color.FromArgb(9, 10, 15);

        Activated += (_, _) => UpdateWebViewActivityState();
        Deactivated += (_, _) =>
        {
            if (_nativeShortcuts.IsRecording)
                _nativeShortcuts.CancelRecording();
            UpdateWebViewActivityState();
        };
        StateChanged += (_, _) => UpdateWebViewActivityState();
        PreviewKeyDown += OnPreviewKeyDown;
        _memoryGovernorTimer.Tick += async (_, _) => await RunMemoryGovernorAsync();
        _performanceDiagnosticsTimer.Tick += (_, _) =>
        {
            CapturePerformanceDiagnostics("periodic");
            if (!_performanceDiagnosticsSteadyCadence &&
                DateTimeOffset.UtcNow - _performanceDiagnosticsStartedUtc >= TimeSpan.FromSeconds(30))
            {
                _performanceDiagnosticsSteadyCadence = true;
                _performanceDiagnosticsTimer.Interval = TimeSpan.FromSeconds(5);
            }
        };
        if (PerformanceDiagnosticsEnabled)
        {
            _performanceDiagnosticsTimer.Start();
            CapturePerformanceDiagnostics("window-created");
        }
        Closed += (_, _) =>
        {
            _memoryGovernorTimer.Stop();
            _performanceDiagnosticsTimer.Stop();
            if (PerformanceDiagnosticsEnabled)
            {
                CapturePerformanceDiagnostics("window-close");
                WritePerformanceDiagnosticsReport();
            }
            _startupMemoryCts?.Cancel();
            _startupMemoryCts?.Dispose();
            _nativeShortcuts.Dispose();
            DiscordView.Dispose();
        };
    }

    public void PrepareForBackgroundPreload()
    {
        WindowStartupLocation = WindowStartupLocation.Manual;
        Left = -32000;
        Top = -32000;
        Opacity = 0;
        ShowInTaskbar = false;
        ShowActivated = false;
    }

    public void RevealAfterSplash()
    {
        var workArea = SystemParameters.WorkArea;
        var width = ActualWidth > 0 ? ActualWidth : Width;
        var height = ActualHeight > 0 ? ActualHeight : Height;

        Left = workArea.Left + Math.Max(0, (workArea.Width - width) / 2);
        Top = workArea.Top + Math.Max(0, (workArea.Height - height) / 2);
        ShowInTaskbar = true;
        Opacity = 1;
        ShowActivated = true;
        Activate();
        Focus();
        UpdateWebViewActivityState();
    }

    public void QueueShellAppearanceRefresh()
    {
        Dispatcher.BeginInvoke(DispatcherPriority.Background, new Action(() =>
        {
            try
            {
                ApplyShellAppearance();
            }
            catch (Exception ex)
            {
                _logger.Write($"Deferred Windows shell appearance refresh failed: {ex.Message}");
            }
        }));
    }

    public async Task InitializeAsync(Action<string> status)
    {
        status("Starting Microsoft Edge WebView2…");
        Directory.CreateDirectory(UserDataFolder);

        _environment = await CoreWebView2Environment.CreateAsync(null, UserDataFolder);
        CapturePerformanceDiagnostics("environment-created");
        _environment.ProcessInfosChanged += (_, _) =>
            Dispatcher.BeginInvoke(new Action(() =>
            {
                UpdateWebViewActivityState();
                CapturePerformanceDiagnostics("process-set-changed");
            }));
        await DiscordView.EnsureCoreWebView2Async(_environment);
        CapturePerformanceDiagnostics("webview-ready");

        var core = DiscordView.CoreWebView2 ?? throw new InvalidOperationException("WebView2 did not initialize.");
        await InstallWebIntegrationAsync(core);
        ConfigureWebView(core);

        status("Restoring your Discord session…");
        var ready = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var firstDocument = true;

        core.DOMContentLoaded += async (_, _) =>
        {
            CapturePerformanceDiagnostics("dom-content-loaded");
            await ApplyBaseLiteModeAsync();
            if (_ultraLiteMode) await ApplyUltraLiteModeAsync(true);
            if (_gamingMode) await ApplyGamingModeAsync(true);
            _ = BeginStartupMemoryStabilizationAsync(core);
            if (firstDocument)
            {
                firstDocument = false;
                ready.TrySetResult(true);
            }
        };

        status("Connecting to Discord…");
        core.Navigate("https://discord.com/app");

        var completed = await Task.WhenAny(ready.Task, Task.Delay(TimeSpan.FromSeconds(20)));
        status(completed == ready.Task ? "Rendering Discord…" : "Discord is taking longer than usual…");
    }

    private void ConfigureWebView(CoreWebView2 core)
    {
        core.Settings.AreDevToolsEnabled = false;
        core.Settings.IsStatusBarEnabled = false;
        core.Settings.AreDefaultContextMenusEnabled = true;
        core.Settings.IsBuiltInErrorPageEnabled = true;
        core.Settings.IsZoomControlEnabled = false;
        core.Settings.AreBrowserAcceleratorKeysEnabled = false;
        core.Settings.IsPinchZoomEnabled = false;
        core.Settings.IsSwipeNavigationEnabled = false;
        core.Settings.IsPasswordAutosaveEnabled = false;
        core.Settings.IsGeneralAutofillEnabled = false;

        core.PermissionRequested += (_, e) =>
        {
            var trusted = UriPolicy.IsDiscordTopLevel(e.Uri);
            var allowedKind = e.PermissionKind is CoreWebView2PermissionKind.Microphone
                or CoreWebView2PermissionKind.Camera
                or CoreWebView2PermissionKind.Notifications;

            e.State = trusted && allowedKind
                ? CoreWebView2PermissionState.Allow
                : CoreWebView2PermissionState.Default;
            e.Handled = trusted && allowedKind;
        };

        core.NavigationStarting += (_, e) =>
        {
            if (UriPolicy.IsDiscordTopLevel(e.Uri))
            {
                CapturePerformanceDiagnostics("navigation-start");
                _startupMemorySettled = false;
                _memoryGovernorTimer.Stop();
                UpdateWebViewActivityState();
                return;
            }
            e.Cancel = true;
            OpenExternal(e.Uri);
        };

        core.NewWindowRequested += (_, e) =>
        {
            e.Handled = true;
            if (UriPolicy.IsDiscordTopLevel(e.Uri))
            {
                core.Navigate(e.Uri);
                return;
            }
            OpenExternal(e.Uri);
        };

        core.ScreenCaptureStarting += (_, _) =>
        {
            // WebView2 owns the security picker/indicator for getDisplayMedia. OrbitCord
            // observes the capture lifecycle here so the host can tune capture-related
            // Utility processes, while the JS bridge handles Discord's in-page share UI.
            _logger.Write("WebView2 screen capture requested.");
            UpdateWebViewActivityState();
        };

        core.ProcessFailed += (_, e) =>
        {
            CapturePerformanceDiagnostics($"process-failed:{e.ProcessFailedKind}:{e.Reason}");
            _logger.Write($"WebView2 process failure: {e.ProcessFailedKind} / {e.Reason}");
        };

        UpdateWebViewActivityState();
    }

    private static void OpenExternal(string? raw)
    {
        if (!UriPolicy.IsSafeExternal(raw)) return;
        try
        {
            Process.Start(new ProcessStartInfo(raw!) { UseShellExecute = true });
        }
        catch
        {
            // External links are non-critical; navigation remains blocked in-app.
        }
    }

    private void UpdateWebViewActivityState()
    {
        var core = DiscordView.CoreWebView2;
        if (core is null) return;

        // Avoid forcing Discord into Low while its startup bundles are still being
        // parsed/compiled. Once the bootstrap settles, return to OrbitCord's lean target.
        // Gaming mode opts into Normal while active for latency consistency.
        core.MemoryUsageTargetLevel = MemoryPolicy.UseLowMemoryTarget(IsActive, _startupMemorySettled, _gamingMode)
            ? CoreWebView2MemoryUsageTargetLevel.Low
            : CoreWebView2MemoryUsageTargetLevel.Normal;

        // When OrbitCord is minimized, stop maintaining the WebView's visual surface.
        // This does not suspend scripts/network/audio. We intentionally keep the surface
        // visible when merely unfocused so side-by-side/multi-monitor use never goes blank.
        var shouldRender = MemoryPolicy.ShouldRenderWebSurface(
            IsActive,
            WindowState == WindowState.Minimized);

        var wantedVisibility = shouldRender ? Visibility.Visible : Visibility.Hidden;
        if (DiscordView.Visibility != wantedVisibility)
        {
            DiscordView.Visibility = wantedVisibility;
        }

        var processMemoryPriority = MemoryPolicy.WindowsProcessMemoryPriority(
            IsActive,
            WindowState == WindowState.Minimized);
        WebViewProcessTuning.ApplyMemoryPriority(_environment, processMemoryPriority);
    }

    private async Task BeginStartupMemoryStabilizationAsync(CoreWebView2 core)
    {
        _startupMemoryCts?.Cancel();
        _startupMemoryCts?.Dispose();
        _startupMemoryCts = new CancellationTokenSource();
        var token = _startupMemoryCts.Token;

        try
        {
            // DOMContentLoaded fires before Discord has finished mounting its React tree and
            // compiling every lazy bootstrap chunk. Give it one short, bounded settle window.
            await Task.Delay(TimeSpan.FromSeconds(4), token);
            if (token.IsCancellationRequested) return;

            _startupMemorySettled = true;
            UpdateWebViewActivityState();
            CapturePerformanceDiagnostics("startup-settled");
            await RequestWebViewMemoryCleanupAsync(core, "startup-settle", force: true);

            if (!token.IsCancellationRequested)
            {
                _memoryGovernorTimer.Start();
            }
        }
        catch (OperationCanceledException)
        {
            // Window closed or a new startup sequence superseded this one.
        }
        catch (Exception ex)
        {
            _logger.Write($"Startup memory stabilization failed: {ex.Message}");
        }
    }

    private async Task RunMemoryGovernorAsync()
    {
        if (_memoryGovernorBusy || !_startupMemorySettled) return;
        var core = DiscordView.CoreWebView2;
        if (core is null || _environment is null) return;

        var workingSet = WebViewProcessTuning.GetWorkingSetBytes(_environment);
        var sinceLastCleanup = DateTimeOffset.UtcNow - _lastMemoryCleanupUtc;
        if (!MemoryPolicy.ShouldRequestCleanup(workingSet, _lastMemoryCleanupWorkingSetBytes, _startupMemorySettled, sinceLastCleanup)) return;

        _memoryGovernorBusy = true;
        try
        {
            await RequestWebViewMemoryCleanupAsync(core, "high-water", force: false);
        }
        finally
        {
            _memoryGovernorBusy = false;
        }
    }

    private async Task RequestWebViewMemoryCleanupAsync(CoreWebView2 core, string reason, bool force)
    {
        if (_environment is null) return;
        var before = WebViewProcessTuning.GetWorkingSetBytes(_environment);
        var sinceLastCleanup = DateTimeOffset.UtcNow - _lastMemoryCleanupUtc;
        if (!force && !MemoryPolicy.ShouldRequestCleanup(before, _lastMemoryCleanupWorkingSetBytes, _startupMemorySettled, sinceLastCleanup)) return;

        _lastMemoryCleanupUtc = DateTimeOffset.UtcNow;
        CapturePerformanceDiagnostics($"cleanup:{reason}:before");
        _logger.Write($"WebView2 memory cleanup ({reason}) before={before / 1024d / 1024d:0} MB [{WebViewProcessTuning.DescribeWorkingSets(_environment)}]");

        // CDP is invoked through WebView2's host API; DevTools UI remains disabled.
        // Both calls are best-effort and isolated so a Runtime/CDP mismatch never breaks Discord.
        try
        {
            await core.CallDevToolsProtocolMethodAsync("HeapProfiler.collectGarbage", "{}");
        }
        catch (Exception ex)
        {
            _logger.Write($"WebView2 V8 GC hint unavailable: {ex.Message}");
        }

        try
        {
            await core.CallDevToolsProtocolMethodAsync(
                "Memory.simulatePressureNotification",
                "{\"level\":\"moderate\"}");
        }
        catch (Exception ex)
        {
            _logger.Write($"WebView2 memory-pressure hint unavailable: {ex.Message}");
        }

        // Give Chromium a brief chance to react to the pressure notification before
        // using the OS working-set trim as a high-water fallback.
        await Task.Delay(350);
        var afterPressure = WebViewProcessTuning.GetWorkingSetBytes(_environment);
        var trimmed = 0;
        if (MemoryPolicy.ShouldHardTrim(afterPressure))
        {
            trimmed = WebViewProcessTuning.TrimWorkingSets(_environment);
            await Task.Delay(100);
        }

        var after = WebViewProcessTuning.GetWorkingSetBytes(_environment);
        _lastMemoryCleanupWorkingSetBytes = after;
        CapturePerformanceDiagnostics($"cleanup:{reason}:after");
        _logger.Write($"WebView2 memory cleanup ({reason}) after={after / 1024d / 1024d:0} MB trimmed={trimmed} [{WebViewProcessTuning.DescribeWorkingSets(_environment)}]");
    }

    private void CapturePerformanceDiagnostics(string reason)
    {
        if (!PerformanceDiagnosticsEnabled) return;
        try
        {
            using var host = Process.GetCurrentProcess();
            host.Refresh();
            var core = DiscordView.CoreWebView2;
            var sample = new PerformanceDiagnosticsSample(
                DateTimeOffset.UtcNow,
                reason,
                IsActive,
                WindowState == WindowState.Minimized,
                _startupMemorySettled,
                core?.MemoryUsageTargetLevel.ToString() ?? "Unavailable",
                Math.Max(0, host.WorkingSet64),
                Math.Max(0, host.PrivateMemorySize64),
                WebViewProcessTuning.CaptureProcessMemoryDetails(_environment));

            lock (_performanceDiagnosticsGate)
            {
                if (_performanceDiagnosticsSamples.Count >= MaxPerformanceDiagnosticSamples)
                {
                    _performanceDiagnosticsSamples.RemoveRange(0, Math.Min(1_000, _performanceDiagnosticsSamples.Count));
                }
                _performanceDiagnosticsSamples.Add(sample);
            }
        }
        catch (Exception ex)
        {
            _logger.Write($"Performance diagnostics sample failed ({reason}): {ex.Message}");
        }
    }

    private void WritePerformanceDiagnosticsReport()
    {
        if (!PerformanceDiagnosticsEnabled) return;
        try
        {
            PerformanceDiagnosticsSample[] samples;
            lock (_performanceDiagnosticsGate)
            {
                samples = _performanceDiagnosticsSamples.ToArray();
            }

            var logsDirectory = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "OrbitCord",
                "Logs");
            Directory.CreateDirectory(logsDirectory);
            var fileName = $"performance-session-{_performanceDiagnosticsStartedUtc:yyyyMMdd-HHmmss}.log";
            var reportPath = Path.Combine(logsDirectory, fileName);
            var report = PerformanceDiagnosticsReport.Format(
                _performanceDiagnosticsStartedUtc,
                DateTimeOffset.UtcNow,
                samples);
            File.WriteAllText(reportPath, report);
            _logger.Write($"Performance diagnostics report written: {reportPath}");
        }
        catch (Exception ex)
        {
            _logger.Write($"Performance diagnostics report failed: {ex.Message}");
        }
    }

    private void OnPreviewKeyDown(object sender, KeyEventArgs e)
    {
        if (_nativeShortcuts.IsRecording) return;

        if ((Keyboard.Modifiers & (ModifierKeys.Control | ModifierKeys.Shift)) !=
            (ModifierKeys.Control | ModifierKeys.Shift)) return;

        if (e.Key == Key.G)
        {
            e.Handled = true;
            Dispatcher.BeginInvoke(new Action(() => _ = ToggleGamingModeAsync()));
        }
        else if (e.Key == Key.P)
        {
            e.Handled = true;
            Dispatcher.BeginInvoke(new Action(() => _ = CopyPerformanceSnapshotAsync()));
        }
        else if (e.Key == Key.R)
        {
            e.Handled = true;
            Dispatcher.BeginInvoke(new Action(() => DiscordView.CoreWebView2?.Reload()));
        }
        else if (e.Key == Key.L)
        {
            e.Handled = true;
            Dispatcher.BeginInvoke(new Action(() => _ = ToggleUltraLiteModeAsync()));
        }
    }


    private void StartNativeShortcuts()
    {
        try
        {
            _nativeShortcuts.Start(_shortcuts);
            _logger.Write($"Native shortcut hook started with {_shortcuts.Count} binding(s).");
        }
        catch (Exception ex)
        {
            _logger.Write($"Native shortcut hook failed: {ex}");
        }
    }

    private async Task InstallWebIntegrationAsync(CoreWebView2 core)
    {
        await AddDocumentStartScriptAsync(core, "discord-runtime.js");
        await AddDocumentStartScriptAsync(core, "discord-shortcut-actions.js");
        await AddDocumentStartScriptAsync(core, "orbitcord-options.js");
        await AddDocumentStartScriptAsync(core, "orbitcord-settings.js");

        core.WebMessageReceived += (_, e) =>
        {
            try
            {
                using var json = JsonDocument.Parse(e.WebMessageAsJson);
                var root = json.RootElement;
                if (!root.TryGetProperty("type", out var typeElement)) return;

                switch (typeElement.GetString())
                {
                    case "orbitcord-shortcut-status":
                        HandleShortcutStatus(root, core);
                        break;
                    case "orbitcord-shortcut-test":
                        TestShortcutAction(root, core);
                        break;
                    case "orbitcord-shortcuts-request":
                        SendShortcutState(core);
                        break;
                    case "orbitcord-shortcut-create":
                        CreateShortcut(root);
                        SendShortcutState(core);
                        break;
                    case "orbitcord-shortcut-delete":
                        DeleteShortcut(root);
                        SendShortcutState(core);
                        break;
                    case "orbitcord-shortcut-action":
                        SetShortcutAction(root);
                        SendShortcutState(core);
                        break;
                    case "orbitcord-shortcut-enabled":
                        SetShortcutEnabled(root);
                        SendShortcutState(core);
                        break;
                    case "orbitcord-shortcut-recording-begin":
                        BeginShortcutRecording(root);
                        break;
                    case "orbitcord-shortcut-recording-cancel":
                        _nativeShortcuts.CancelRecording();
                        break;
                    case "orbitcord-options-request":
                        SendOptionsState(core);
                        break;
                    case "orbitcord-options-save":
                        HandleOptionsSave(root, core);
                        break;
                    case "orbitcord-customisation-request":
                        SendCustomisationState(core);
                        break;
                    case "orbitcord-icon-select":
                        HandleIconSelection(root);
                        SendCustomisationState(core);
                        break;
                    case "orbitcord-icon-upload":
                        HandleIconUpload(root);
                        SendCustomisationState(core);
                        break;
                    case "orbitcord-icon-delete":
                        var deleteError = HandleIconDelete(root);
                        SendCustomisationState(core, deleteError);
                        break;
                    case "orbitcord-app-name-prompt":
                        HandleAppNamePrompt(core);
                        break;
                }
            }
            catch (Exception ex)
            {
                _logger.Write($"OrbitCord Web bridge message parse failed: {ex.Message}");
            }
        };
    }

    private static async Task AddDocumentStartScriptAsync(CoreWebView2 core, string fileName)
    {
        var scriptPath = Path.Combine(AppContext.BaseDirectory, "Scripts", fileName);
        if (!File.Exists(scriptPath))
            throw new FileNotFoundException($"OrbitCord Web script is missing: {fileName}", scriptPath);

        var source = await File.ReadAllTextAsync(scriptPath);
        await core.AddScriptToExecuteOnDocumentCreatedAsync(source);
    }


    private void SendOptionsState(CoreWebView2 core)
    {
        var options = _optionsStore.Load();
        var payload = new
        {
            type = "orbitcord-options-state",
            disableSelfStreamPreview = options.DisableSelfStreamPreview
        };
        core.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
    }

    private void HandleOptionsSave(JsonElement root, CoreWebView2 core)
    {
        var disableSelfStreamPreview = root.TryGetProperty("disableSelfStreamPreview", out var value)
            && value.ValueKind is JsonValueKind.True or JsonValueKind.False
            && value.GetBoolean();
        _optionsStore.Save(new OrbitCordOptions(disableSelfStreamPreview));
        _logger.Write($"Disable self stream preview: {(disableSelfStreamPreview ? "ON" : "OFF")}");
        SendOptionsState(core);
    }

    private void HandleIconSelection(JsonElement root)
    {
        var icon = root.TryGetProperty("icon", out var iconElement) ? iconElement.GetString()?.Trim().ToLowerInvariant() : null;
        if (string.IsNullOrWhiteSpace(icon)) return;
        try
        {
            if (icon == "custom") _iconCustomizationStore.SelectCustom();
            else _iconCustomizationStore.SavePreset(icon);
            ApplySelectedWindowIcon();
            ApplyShellAppearance();
            _logger.Write($"OrbitCord icon changed to {icon}.");
        }
        catch (Exception ex)
        {
            _logger.Write($"OrbitCord icon selection failed: {ex.Message}");
        }
    }

    private void HandleIconUpload(JsonElement root)
    {
        if (!root.TryGetProperty("dataUrl", out var dataElement) || dataElement.ValueKind != JsonValueKind.String) return;
        var dataUrl = dataElement.GetString() ?? string.Empty;
        const string prefix = "data:image/png;base64,";
        if (!dataUrl.StartsWith(prefix, StringComparison.OrdinalIgnoreCase))
        {
            _logger.Write("OrbitCord custom icon upload rejected: invalid data URL.");
            return;
        }

        try
        {
            var bytes = Convert.FromBase64String(dataUrl[prefix.Length..]);
            _iconCustomizationStore.SaveCustomPng(bytes);
            ApplySelectedWindowIcon();
            ApplyShellAppearance();
            _logger.Write($"OrbitCord custom icon saved ({bytes.Length:N0} bytes).");
        }
        catch (Exception ex)
        {
            _logger.Write($"OrbitCord custom icon upload failed: {ex.Message}");
        }
    }

    private string HandleIconDelete(JsonElement root)
    {
        var icon = root.TryGetProperty("icon", out var iconElement) ? iconElement.GetString()?.Trim().ToLowerInvariant() : null;
        if (string.IsNullOrWhiteSpace(icon)) return "Icon not found";
        try
        {
            _iconCustomizationStore.DeleteIcon(icon);
            ApplySelectedWindowIcon();
            ApplyShellAppearance();
            _logger.Write($"OrbitCord icon deleted: {icon}.");
            return "";
        }
        catch (Exception ex)
        {
            _logger.Write($"OrbitCord icon deletion failed: {ex.Message}");
            return ex.Message;
        }
    }


    private void SendCustomisationState(CoreWebView2 core, string error = "")
    {
        try
        {
            var presets = _iconCustomizationStore.AvailablePresetIds.Select(id => new
            {
                id,
                dataUrl = IconCustomizationStore.ToDataUrl(_iconCustomizationStore.ReadPresetPng(id))
            }).ToArray();
            var custom = _iconCustomizationStore.ReadCustomPng();
            var payload = new
            {
                type = "orbitcord-customisation-state",
                selectedIcon = _iconCustomizationStore.SelectedIcon,
                presets,
                customIconDataUrl = custom is null ? "" : IconCustomizationStore.ToDataUrl(custom),
                customAppName = _iconCustomizationStore.CustomAppName,
                displayAppName = _iconCustomizationStore.DisplayAppName,
                error
            };
            core.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
        }
        catch (Exception ex)
        {
            _logger.Write($"OrbitCord customisation state failed: {ex.Message}");
        }
    }

    private void ApplySelectedAppName()
    {
        try
        {
            var title = _iconCustomizationStore.DisplayAppName;
            NativeWindowStyling.ApplyWindowTitle(this, title);
        }
        catch (Exception ex)
        {
            NativeWindowStyling.ApplyWindowTitle(this, "OrbitCord");
            _logger?.Write($"OrbitCord app name load failed: {ex.Message}");
        }
    }


    private void HandleAppNamePrompt(CoreWebView2 core)
    {
        try
        {
            var dialog = new RenameAppDialog(_iconCustomizationStore.CustomAppName) { Owner = this };
            if (dialog.ShowDialog() == true)
            {
                _iconCustomizationStore.SaveCustomAppName(dialog.AppName);
                ApplySelectedAppName();
                ApplySelectedWindowIcon();
                ApplyShellAppearance();
                _logger.Write($"OrbitCord app display name changed to {_iconCustomizationStore.DisplayAppName}.");
            }
            SendCustomisationState(core);
        }
        catch (Exception ex)
        {
            _logger.Write($"OrbitCord native rename failed: {ex.Message}");
            SendCustomisationState(core, ex.Message);
        }
    }

    private void ApplySelectedWindowIcon()
    {
        try
        {
            var path = _iconCustomizationStore.GetSelectedIconPath();
            if (!File.Exists(path)) return;
            using var stream = File.OpenRead(path);
            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.StreamSource = stream;
            bitmap.EndInit();
            bitmap.Freeze();
            Icon = bitmap;
            WindowsShellIntegration.ApplyWindowAppearance(
                this,
                _iconCustomizationStore.DisplayAppName,
                path,
                _logger);
        }
        catch (Exception ex)
        {
            _logger?.Write($"OrbitCord window icon load failed: {ex.Message}");
        }
    }

    private void ApplyShellAppearance()
    {
        WindowsShellIntegration.SyncAppearance(
            _iconCustomizationStore.DisplayAppName,
            _iconCustomizationStore.GetSelectedIconPath(),
            _logger);
    }

    private void HandleShortcutStatus(JsonElement root, CoreWebView2 core)
    {
        var ok = root.TryGetProperty("ok", out var okValue) && okValue.GetBoolean();
        var action = root.TryGetProperty("action", out var actionValue) ? actionValue.GetString() ?? "unknown" : "unknown";
        var detail = root.TryGetProperty("detail", out var detailValue) ? detailValue.GetString() ?? "" : "";
        if (!ok) _logger.Write($"Shortcut action unavailable: {action} / {detail}");

        var result = JsonSerializer.Serialize(new
        {
            type = "orbitcord-shortcut-test-result",
            action,
            ok,
            detail
        });
        core.PostWebMessageAsJson(result);
    }

    private async void TestShortcutAction(JsonElement root, CoreWebView2 core)
    {
        var actionId = root.TryGetProperty("action", out var actionValue)
            ? actionValue.GetString()
            : null;
        var info = ShortcutCatalog.FindByDiscordId(actionId);
        if (info is null)
        {
            var result = JsonSerializer.Serialize(new
            {
                type = "orbitcord-shortcut-test-result",
                action = actionId ?? "",
                ok = false,
                detail = "unknown action"
            });
            core.PostWebMessageAsJson(result);
            return;
        }

        await DispatchShortcutActionAsync(core, info, true, reportNativeTestResult: true);
        if (info.IsHold)
        {
            await Task.Delay(180);
            await DispatchShortcutActionAsync(core, info, false);
        }
    }

    private void SendShortcutState(CoreWebView2 core)
    {
        var payload = new
        {
            type = "orbitcord-shortcuts-state",
            hookRunning = _nativeShortcuts.IsRunning,
            revision = _shortcutRevision,
            actions = ShortcutCatalog.All.Select(info => new
            {
                id = info.DiscordActionId,
                name = info.DisplayName,
                description = info.Description,
                isHold = info.IsHold
            }),
            bindings = _shortcuts.Select(binding =>
            {
                var info = ShortcutCatalog.Get(binding.Action);
                return new
                {
                    id = binding.Id,
                    action = info.DiscordActionId,
                    virtualKeys = binding.VirtualKeys,
                    enabled = binding.Enabled,
                    chord = NativeKeyCode.FormatChord(binding.VirtualKeys)
                };
            })
        };

        core.PostWebMessageAsJson(JsonSerializer.Serialize(payload));
    }

    private static bool TryReadShortcutId(JsonElement root, out Guid id)
    {
        id = Guid.Empty;
        if (!root.TryGetProperty("id", out var idElement) || idElement.ValueKind != JsonValueKind.String)
            return false;
        return Guid.TryParse(idElement.GetString(), out id) && id != Guid.Empty;
    }

    private void CreateShortcut(JsonElement root)
    {
        var actionId = root.TryGetProperty("action", out var actionElement) ? actionElement.GetString() : null;
        var info = ShortcutCatalog.FindByDiscordId(actionId) ?? ShortcutCatalog.All.First();
        var binding = new ShortcutBinding
        {
            Id = Guid.NewGuid(),
            Action = info.Action,
            VirtualKeys = [],
            Enabled = true
        };
        _shortcuts.Add(binding);
        _shortcutRevision++;
        _logger.Write($"Shortcut draft created: {binding.Id} / {info.DiscordActionId}");
    }

    private void DeleteShortcut(JsonElement root)
    {
        if (!TryReadShortcutId(root, out var id)) return;
        if (_nativeShortcuts.RecordingBindingId == id)
            _nativeShortcuts.CancelRecording();

        var removed = _shortcuts.RemoveAll(binding => binding.Id == id) > 0;
        if (!removed) return;

        _shortcutRevision++;
        PersistShortcutBindings();
        _logger.Write($"Shortcut deleted: {id}");
    }

    private void SetShortcutAction(JsonElement root)
    {
        if (!TryReadShortcutId(root, out var id)) return;
        var actionId = root.TryGetProperty("action", out var actionElement) ? actionElement.GetString() : null;
        var info = ShortcutCatalog.FindByDiscordId(actionId);
        var binding = _shortcuts.FirstOrDefault(item => item.Id == id);
        if (binding is null || info is null) return;

        binding.Action = info.Action;
        _shortcutRevision++;
        PersistShortcutBindings();
        _logger.Write($"Shortcut action updated: {id} -> {info.DiscordActionId}");
    }

    private void SetShortcutEnabled(JsonElement root)
    {
        if (!TryReadShortcutId(root, out var id)) return;
        if (!root.TryGetProperty("enabled", out var enabledElement) ||
            enabledElement.ValueKind is not (JsonValueKind.True or JsonValueKind.False))
            return;

        var binding = _shortcuts.FirstOrDefault(item => item.Id == id);
        if (binding is null) return;

        binding.Enabled = enabledElement.GetBoolean();
        _shortcutRevision++;
        PersistShortcutBindings();
        _logger.Write($"Shortcut enabled updated: {id} -> {binding.Enabled}");
    }

    private void BeginShortcutRecording(JsonElement root)
    {
        if (!TryReadShortcutId(root, out var id)) return;
        if (_shortcuts.All(binding => binding.Id != id)) return;
        _nativeShortcuts.BeginRecording(id);
        _logger.Write($"Native shortcut recording started: {id}");
    }

    private void PersistShortcutBindings()
    {
        _shortcutStore.Save(_shortcuts);
        _nativeShortcuts.Reload(_shortcuts);
    }

    private void OnNativeShortcutRecordingStateChanged(Guid? bindingId)
    {
        Dispatcher.BeginInvoke(new Action(() =>
        {
            var core = DiscordView.CoreWebView2;
            if (core is null) return;
            core.PostWebMessageAsJson(JsonSerializer.Serialize(new
            {
                type = "orbitcord-shortcut-recording-state",
                id = bindingId?.ToString(),
                active = bindingId.HasValue
            }));
        }));
    }

    private void OnNativeShortcutRecordingPreview(Guid bindingId, IReadOnlyList<int> keys)
    {
        var snapshot = keys.ToArray();
        Dispatcher.BeginInvoke(new Action(() =>
        {
            var core = DiscordView.CoreWebView2;
            if (core is null) return;
            core.PostWebMessageAsJson(JsonSerializer.Serialize(new
            {
                type = "orbitcord-shortcut-recording-preview",
                id = bindingId.ToString(),
                virtualKeys = snapshot,
                chord = NativeKeyCode.FormatChord(snapshot)
            }));
        }));
    }

    private void OnNativeShortcutRecordingCompleted(Guid bindingId, IReadOnlyList<int> keys)
    {
        var snapshot = keys.ToArray();
        Dispatcher.BeginInvoke(new Action(() =>
        {
            var binding = _shortcuts.FirstOrDefault(item => item.Id == bindingId);
            if (binding is null) return;

            binding.VirtualKeys = snapshot.ToList();
            _shortcutRevision++;
            PersistShortcutBindings();
            _logger.Write($"Shortcut recorded: {bindingId} -> {NativeKeyCode.FormatChord(snapshot)}");

            var core = DiscordView.CoreWebView2;
            if (core is not null)
                SendShortcutState(core);
        }));
    }

    private static void SendShortcutActionToWeb(CoreWebView2 core, ShortcutActionInfo info, bool pressed)
    {
        var json = JsonSerializer.Serialize(new
        {
            type = "orbitcord-shortcut-execute",
            action = info.DiscordActionId,
            pressed
        });
        core.PostWebMessageAsJson(json);
    }

    private static void SendShortcutTestResult(
        CoreWebView2 core,
        ShortcutActionInfo info,
        bool ok,
        string detail)
    {
        core.PostWebMessageAsJson(JsonSerializer.Serialize(new
        {
            type = "orbitcord-shortcut-test-result",
            action = info.DiscordActionId,
            ok,
            detail
        }));
    }

    private static async Task DispatchDevToolsKeyEventAsync(
        CoreWebView2 core,
        string type,
        string key,
        string code,
        int virtualKeyCode,
        int modifiers)
    {
        var parameters = JsonSerializer.Serialize(new
        {
            type,
            modifiers,
            key,
            code,
            windowsVirtualKeyCode = virtualKeyCode,
            nativeVirtualKeyCode = virtualKeyCode,
            autoRepeat = false,
            isKeypad = false,
            isSystemKey = false,
            location = 0
        });
        await core.CallDevToolsProtocolMethodAsync("Input.dispatchKeyEvent", parameters);
    }

    private async Task<bool> TryDispatchDiscordBuiltinShortcutAsync(
        CoreWebView2 core,
        ShortcutAction action)
    {
        if (action != ShortcutAction.ToggleDeafen) return false;

        // Discord's documented Windows deafen shortcut is Ctrl+Shift+D. Sending
        // the individual key transitions through CDP makes Discord's own keyboard
        // pipeline authoritative and avoids depending on private webpack symbols.
        // CDP calls are awaited in order because WebView2 documents that protocol
        // calls can otherwise be processed out of order.
        try
        {
            await DispatchDevToolsKeyEventAsync(core, "rawKeyDown", "Control", "ControlLeft", 0x11, 2);
            await DispatchDevToolsKeyEventAsync(core, "rawKeyDown", "Shift", "ShiftLeft", 0x10, 10);
            await DispatchDevToolsKeyEventAsync(core, "rawKeyDown", "D", "KeyD", 0x44, 10);
            await DispatchDevToolsKeyEventAsync(core, "keyUp", "D", "KeyD", 0x44, 10);
            await DispatchDevToolsKeyEventAsync(core, "keyUp", "Shift", "ShiftLeft", 0x10, 2);
            await DispatchDevToolsKeyEventAsync(core, "keyUp", "Control", "ControlLeft", 0x11, 0);
            _logger.Write("Discord built-in deafen shortcut dispatched through WebView2 CDP.");
            return true;
        }
        catch (Exception ex)
        {
            _logger.Write($"Discord built-in deafen shortcut unavailable: {ex.Message}");

            // Best effort key-up cleanup. A partial CDP failure must never leave
            // Ctrl/Shift logically held inside the renderer.
            try { await DispatchDevToolsKeyEventAsync(core, "keyUp", "D", "KeyD", 0x44, 10); } catch { }
            try { await DispatchDevToolsKeyEventAsync(core, "keyUp", "Shift", "ShiftLeft", 0x10, 2); } catch { }
            try { await DispatchDevToolsKeyEventAsync(core, "keyUp", "Control", "ControlLeft", 0x11, 0); } catch { }
            return false;
        }
    }

    private async Task<bool> DispatchShortcutActionAsync(
        CoreWebView2 core,
        ShortcutActionInfo info,
        bool pressed,
        bool reportNativeTestResult = false)
    {
        if (info.Action == ShortcutAction.ToggleDeafen)
        {
            // Toggle actions fire on key-down only. The matching native key-up is
            // intentionally consumed here because the CDP sequence already emits
            // the complete Ctrl+Shift+D press/release transaction.
            if (!pressed) return true;

            if (await TryDispatchDiscordBuiltinShortcutAsync(core, info.Action))
            {
                if (reportNativeTestResult)
                    SendShortcutTestResult(core, info, true, "discord-builtin-hotkey");
                return true;
            }
        }

        // Existing JS/MediaEngine/DOM logic stays as a fallback if CDP is not
        // available on a particular WebView2 runtime. Mute keeps using this path
        // because it already works reliably on the user's current Discord build.
        SendShortcutActionToWeb(core, info, pressed);
        return false;
    }

    private void OnNativeShortcutAction(ShortcutAction action, bool pressed)
    {
        _logger.Write($"Native shortcut {action}: {(pressed ? "down" : "up")}");
        Dispatcher.BeginInvoke(new Action(() =>
        {
            var core = DiscordView.CoreWebView2;
            if (core is null) return;
            _ = DispatchShortcutActionAsync(core, ShortcutCatalog.Get(action), pressed);
        }));
    }

    private async Task ToggleGamingModeAsync()
    {
        _gamingMode = !_gamingMode;
        await ApplyGamingModeAsync(_gamingMode);
        UpdateWebViewActivityState();
        await ShowToastAsync(_gamingMode ? "Gaming Mode ON • performance memory target" : "Gaming Mode OFF • lean memory target");
    }

    private async Task ToggleUltraLiteModeAsync()
    {
        _ultraLiteMode = !_ultraLiteMode;
        await ApplyUltraLiteModeAsync(_ultraLiteMode);
        await ShowToastAsync(_ultraLiteMode ? "Ultra Lite ON • lean visuals" : "Ultra Lite OFF");
    }

    private async Task ApplyBaseLiteModeAsync()
    {
        var core = DiscordView.CoreWebView2;
        if (core is null) return;
        await core.ExecuteScriptAsync(VisualModesCss.EnableBaseScript);
    }

    private async Task ApplyUltraLiteModeAsync(bool enabled)
    {
        var core = DiscordView.CoreWebView2;
        if (core is null) return;
        await core.ExecuteScriptAsync(enabled ? VisualModesCss.EnableUltraScript : VisualModesCss.DisableUltraScript);
    }

    private async Task ApplyGamingModeAsync(bool enabled)
    {
        var core = DiscordView.CoreWebView2;
        if (core is null) return;
        await core.ExecuteScriptAsync(enabled ? GamingCss.EnableScript : GamingCss.DisableScript);
    }

    private async Task CopyPerformanceSnapshotAsync()
    {
        if (_environment is null) return;

        var samples = new List<ProcessMemorySample>();
        AddProcessSample(samples, Environment.ProcessId, "OrbitCord host");

        foreach (var info in _environment.GetProcessInfos())
        {
            AddProcessSample(samples, info.ProcessId, $"WebView2/{info.Kind}");
        }

        var unique = samples
            .GroupBy(x => x.ProcessId)
            .Select(g => g.First())
            .ToArray();

        var memoryTarget = DiscordView.CoreWebView2?.MemoryUsageTargetLevel.ToString().ToUpperInvariant() ?? "UNKNOWN";
        var snapshot = PerformanceSnapshot.Format(DateTimeOffset.Now, _gamingMode, _ultraLiteMode, memoryTarget, DiscordView.Visibility == Visibility.Visible, unique);
        Clipboard.SetText(snapshot);
        var totalMb = unique.Sum(x => x.WorkingSetBytes) / 1024d / 1024d;
        await ShowToastAsync($"Snapshot copied • {totalMb:0} MB • {unique.Length} processes");
    }

    private static void AddProcessSample(List<ProcessMemorySample> samples, int pid, string kind)
    {
        try
        {
            using var process = Process.GetProcessById(pid);
            samples.Add(new ProcessMemorySample(pid, kind, process.WorkingSet64));
        }
        catch
        {
            // Process can exit between WebView2 enumeration and sampling.
        }
    }

    private async Task ShowToastAsync(string message)
    {
        _toastCts?.Cancel();
        _toastCts?.Dispose();
        _toastCts = new CancellationTokenSource();
        var token = _toastCts.Token;

        ToastText.Text = message;
        Toast.Visibility = Visibility.Visible;
        try
        {
            await Task.Delay(1800, token);
        }
        catch (OperationCanceledException)
        {
            return;
        }

        if (!token.IsCancellationRequested) Toast.Visibility = Visibility.Collapsed;
    }
}
