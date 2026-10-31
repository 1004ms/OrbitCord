using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;

namespace OrbitCord.Installer;

public partial class MainWindow : Window
{
    private readonly InstallerEngine _engine;
    private readonly bool _uninstallOnly;
    private InstalledApplicationInfo? _installed;
    private ReleaseDescriptor? _latestRelease;
    private CancellationTokenSource? _operationCts;
    private bool _busy;
    private bool _optionsExpanded;
    private bool _checkingLatestRelease;

    public MainWindow(bool uninstallOnly)
    {
        InitializeComponent();
        _uninstallOnly = uninstallOnly;
        _engine = new InstallerEngine(new GitHubReleaseClient(), new WindowsIntegration());

        Loaded += MainWindow_OnLoaded;
        Closed += (_, _) =>
        {
            _operationCts?.Cancel();
            _operationCts?.Dispose();
            _engine.Dispose();
        };
    }

    private async void MainWindow_OnLoaded(object sender, RoutedEventArgs e)
    {
        VersionText.Text = $"Setup v{InstallerBuildInfo.Version}";
        RefreshInstalledState();

        if (_uninstallOnly)
        {
            ConfigureUninstallMode();
            return;
        }

        ConfigureNormalMode();
        await RefreshLatestReleaseAsync();
        if (IsVisible) ConfigureNormalMode();
    }

    private async Task RefreshLatestReleaseAsync()
    {
        _checkingLatestRelease = true;
        if (IsVisible && !_uninstallOnly) ConfigureNormalMode();
        try
        {
            using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(12));
            _latestRelease = await _engine.GetLatestReleaseAsync(timeout.Token);
        }
        catch (Exception)
        {
            _latestRelease = null;
        }
        finally
        {
            _checkingLatestRelease = false;
        }
    }

    private void RefreshInstalledState()
    {
        _installed = _engine.GetInstalledApplication();
    }

    private void ConfigureNormalMode()
    {
        InstallLocationSection.Visibility = Visibility.Visible;
        InstallPreferencesSection.Visibility = Visibility.Visible;

        if (_installed is null)
        {
            InstallPathBox.Text = InstallerEngine.DefaultInstallDirectory;
            InstallPathBox.IsReadOnly = false;
            DesktopShortcutCheckBox.IsChecked = false;

            StatusText.Text = _checkingLatestRelease
                ? "Checking latest release..."
                : _latestRelease is not null
                    ? $"Ready to install OrbitCord {_latestRelease.Version}."
                    : "Ready to install. Latest release will be checked before downloading.";
        }
        else
        {
            InstallPathBox.Text = _installed.InstallLocation;
            InstallPathBox.IsReadOnly = true;
            var installedExe = Path.Combine(_installed.InstallLocation, "OrbitCord.exe");
            DesktopShortcutCheckBox.IsChecked = _engine.HasDesktopShortcut(installedExe);

            if (_checkingLatestRelease)
            {
                StatusText.Text = $"OrbitCord {_installed.Version} is installed. Checking for updates...";
            }
            else if (_latestRelease is null)
            {
                StatusText.Text = $"OrbitCord {_installed.Version} is installed. Could not check GitHub for updates.";
            }
            else if (HasUpdateAvailable())
            {
                StatusText.Text = $"Update {_installed.Version} → {_latestRelease.Version} available.";
            }
            else
            {
                StatusText.Text = $"OrbitCord {_installed.Version} is up to date.";
            }
        }

        ShowReadyState();
        ApplyActionState();
    }

    private void ConfigureUninstallMode()
    {
        _optionsExpanded = true;
        ReadyPanel.Visibility = Visibility.Visible;
        ProgressPanel.Visibility = Visibility.Collapsed;
        SuccessPanel.Visibility = Visibility.Collapsed;
        InstallOptionsOverlay.Visibility = Visibility.Visible;
        InstallLocationSection.Visibility = Visibility.Collapsed;
        InstallPreferencesSection.Visibility = Visibility.Collapsed;
        InstallButton.Visibility = Visibility.Collapsed;
        UpdateButton.Visibility = Visibility.Collapsed;
        OptionsToggleButton.Visibility = Visibility.Collapsed;

        StatusText.Text = _installed is null
            ? "OrbitCord is not installed."
            : $"Ready to uninstall OrbitCord {_installed.Version}.";

        ApplyActionState();
    }

    private bool IsCurrentVersionInstalled() =>
        _installed is not null &&
        _latestRelease is not null &&
        CompareVersions(_installed.Version, _latestRelease.Version) >= 0;

    private bool HasUpdateAvailable() =>
        _installed is not null &&
        _latestRelease is not null &&
        CompareVersions(_installed.Version, _latestRelease.Version) < 0;

    private static int CompareVersions(string left, string right)
    {
        var normalizedLeft = left.Trim().TrimStart('v', 'V');
        var normalizedRight = right.Trim().TrimStart('v', 'V');
        if (Version.TryParse(normalizedLeft, out var leftVersion) &&
            Version.TryParse(normalizedRight, out var rightVersion))
        {
            return leftVersion.CompareTo(rightVersion);
        }

        return string.Compare(normalizedLeft, normalizedRight, StringComparison.OrdinalIgnoreCase);
    }

    private void ShowReadyState()
    {
        if (_uninstallOnly) return;

        ReadyPanel.Visibility = Visibility.Visible;
        ProgressPanel.Visibility = Visibility.Collapsed;
        SuccessPanel.Visibility = Visibility.Collapsed;
        OptionsToggleButton.Visibility = Visibility.Visible;

        var installed = _installed is not null;
        InstallButton.Visibility = installed ? Visibility.Collapsed : Visibility.Visible;
        UpdateButton.Visibility = installed ? Visibility.Visible : Visibility.Collapsed;
        UpdateButton.Content = _checkingLatestRelease
            ? "Checking..."
            : _latestRelease is null
                ? "Check for updates"
                : IsCurrentVersionInstalled() ? "Up to date" : "Update";

        InstallOptionsOverlay.Visibility = _optionsExpanded ? Visibility.Visible : Visibility.Collapsed;
        UninstallButton.Visibility = installed ? Visibility.Visible : Visibility.Collapsed;
    }

    private void ShowProgressState()
    {
        ReadyPanel.Visibility = Visibility.Collapsed;
        SuccessPanel.Visibility = Visibility.Collapsed;
        ProgressPanel.Visibility = Visibility.Visible;
        InstallProgress.IsIndeterminate = false;
        InstallProgress.Value = 0;
        ProgressPercentText.Text = "0%";
        ProgressStatusText.Text = "Preparing...";

        var updating = _installed is not null;
        var targetVersion = _latestRelease?.Version;
        OperationTitleText.Text = updating ? "Updating OrbitCord..." : "Installing OrbitCord...";
        OperationSubtitleText.Text = targetVersion is not null
            ? $"Downloading and applying v{targetVersion}."
            : "Downloading the latest OrbitCord release from GitHub.";
    }

    private void ShowSuccessState()
    {
        ReadyPanel.Visibility = Visibility.Collapsed;
        ProgressPanel.Visibility = Visibility.Collapsed;
        SuccessPanel.Visibility = Visibility.Visible;
        SuccessDetailText.Text = _installed is null
            ? "OrbitCord is ready to go."
            : $"OrbitCord {_installed.Version} is ready to go.";
    }

    private void BrowseButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_installed is not null) return;

        var current = InstallPathBox.Text;
        var initial = Directory.Exists(current) ? current : Path.GetDirectoryName(current);
        var dialog = new OpenFolderDialog
        {
            Title = "Choose OrbitCord install location",
            InitialDirectory = Directory.Exists(initial)
                ? initial
                : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            Multiselect = false
        };

        if (dialog.ShowDialog() != true) return;

        var selected = Path.TrimEndingDirectorySeparator(dialog.FolderName);
        if (!string.Equals(Path.GetFileName(selected), "OrbitCord", StringComparison.OrdinalIgnoreCase))
            selected = Path.Combine(selected, "OrbitCord");

        InstallPathBox.Text = selected;
    }

    private void OptionsToggleButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy || _uninstallOnly) return;
        _optionsExpanded = !_optionsExpanded;
        InstallOptionsOverlay.Visibility = _optionsExpanded ? Visibility.Visible : Visibility.Collapsed;
    }

    private async void InstallButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy || _installed is not null || _uninstallOnly) return;
        await RunInstallAsync();
    }

    private async void UpdateButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy || _installed is null || _uninstallOnly) return;

        if (_latestRelease is null)
        {
            await RefreshLatestReleaseAsync();
            if (IsVisible) ConfigureNormalMode();
            if (_latestRelease is null || IsCurrentVersionInstalled()) return;
        }

        if (!HasUpdateAvailable()) return;
        await RunInstallAsync();
    }

    private async void UninstallButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy || _installed is null) return;
        await RunUninstallAsync();
    }

    private async Task RunInstallAsync()
    {
        var completed = false;
        ShowProgressState();
        SetBusy(true);
        _operationCts = new CancellationTokenSource();

        try
        {
            var options = new InstallOptions(
                InstallPathBox.Text,
                DesktopShortcutCheckBox.IsChecked == true,
                LaunchAfterInstallCheckBox.IsChecked == true);

            var progress = new Progress<InstallerProgress>(UpdateProgress);
            await _engine.InstallAsync(options, progress, _operationCts.Token);

            RefreshInstalledState();
            InstallProgress.IsIndeterminate = false;
            InstallProgress.Value = 100;
            ProgressPercentText.Text = "100%";
            StatusText.Text = _installed is null
                ? "Done."
                : $"OrbitCord {_installed.Version} is ready.";

            completed = true;
            ShowSuccessState();
        }
        catch (OperationCanceledException)
        {
            StatusText.Text = "Cancelled.";
        }
        catch (Exception ex)
        {
            StatusText.Text = ex.Message;
            MessageBox.Show(this, ex.Message, "OrbitCord Setup", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _operationCts?.Dispose();
            _operationCts = null;
            SetBusy(false);

            if (IsVisible && !_uninstallOnly && !completed)
                ConfigureNormalMode();
        }
    }

    private async Task RunUninstallAsync()
    {
        var confirmation = MessageBox.Show(
            this,
            "Uninstall OrbitCord? Local settings and profile data will be kept.",
            "OrbitCord Setup",
            MessageBoxButton.YesNo,
            MessageBoxImage.Question);

        if (confirmation != MessageBoxResult.Yes) return;

        ShowProgressState();
        SetBusy(true);
        _operationCts = new CancellationTokenSource();

        try
        {
            var progress = new Progress<InstallerProgress>(UpdateProgress);
            await _engine.UninstallAsync(progress, _operationCts.Token);
            InstallProgress.IsIndeterminate = false;
            InstallProgress.Value = 100;
            ProgressPercentText.Text = "100%";
            StatusText.Text = "OrbitCord uninstalled.";
            MessageBox.Show(this, StatusText.Text, "OrbitCord Setup", MessageBoxButton.OK, MessageBoxImage.Information);
            Close();
        }
        catch (OperationCanceledException)
        {
            StatusText.Text = "Cancelled.";
        }
        catch (Exception ex)
        {
            StatusText.Text = ex.Message;
            MessageBox.Show(this, ex.Message, "OrbitCord Setup", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _operationCts?.Dispose();
            _operationCts = null;
            if (IsVisible)
            {
                SetBusy(false);
                if (_uninstallOnly) ConfigureUninstallMode();
                else ConfigureNormalMode();
            }
        }
    }

    private void UpdateProgress(InstallerProgress update)
    {
        StatusText.Text = update.Message;
        ProgressStatusText.Text = update.Message;

        if (update.Percent is { } percent)
        {
            var clamped = Math.Clamp(percent, 0, 100);
            InstallProgress.IsIndeterminate = false;
            InstallProgress.Value = clamped;
            ProgressPercentText.Text = $"{clamped:0}%";
        }
        else
        {
            InstallProgress.IsIndeterminate = true;
            ProgressPercentText.Text = "...";
        }
    }

    private void SetBusy(bool busy)
    {
        _busy = busy;
        ApplyActionState();
    }

    private void ApplyActionState()
    {
        var installed = _installed is not null;
        var currentVersion = IsCurrentVersionInstalled();

        InstallButton.IsEnabled = !_busy && !_uninstallOnly && !installed;
        UpdateButton.IsEnabled = !_busy && !_uninstallOnly && installed && !_checkingLatestRelease &&
                                 (_latestRelease is null || !currentVersion);
        UninstallButton.IsEnabled = !_busy && installed;

        BrowseButton.IsEnabled = !_busy && !_uninstallOnly && !installed;
        InstallPathBox.IsEnabled = !_busy && !_uninstallOnly && !installed;
        DesktopShortcutCheckBox.IsEnabled = !_busy && !_uninstallOnly;
        LaunchAfterInstallCheckBox.IsEnabled = !_busy && !_uninstallOnly;
        InstallOptionsPanel.IsEnabled = !_busy;
        OptionsToggleButton.IsEnabled = !_busy && !_uninstallOnly;
    }

    private void LaunchSuccessButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_installed is null) return;

        try
        {
            var executable = Path.Combine(_installed.InstallLocation, "OrbitCord.exe");
            if (File.Exists(executable))
            {
                Process.Start(new ProcessStartInfo(executable)
                {
                    UseShellExecute = true,
                    WorkingDirectory = _installed.InstallLocation
                });
                Close();
            }
        }
        catch (Exception ex)
        {
            StatusText.Text = ex.Message;
            MessageBox.Show(this, ex.Message, "OrbitCord Setup", MessageBoxButton.OK, MessageBoxImage.Error);
        }
    }

    private void CloseSuccessButton_OnClick(object sender, RoutedEventArgs e) => Close();

    private void TitleBar_OnMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed) DragMove();
    }

    private void MinimizeButton_OnClick(object sender, RoutedEventArgs e) =>
        WindowState = WindowState.Minimized;

    private void CloseButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy)
        {
            var result = MessageBox.Show(
                this,
                "Cancel the current operation?",
                "OrbitCord Setup",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result != MessageBoxResult.Yes) return;

            StatusText.Text = "Cancelling...";
            ProgressStatusText.Text = "Cancelling...";
            _operationCts?.Cancel();
            return;
        }

        Close();
    }
}
