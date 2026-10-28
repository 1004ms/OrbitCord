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
    private CancellationTokenSource? _operationCts;
    private bool _busy;

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

    private void MainWindow_OnLoaded(object sender, RoutedEventArgs e)
    {
        VersionText.Text = $"v{InstallerBuildInfo.Version}";
        RefreshInstalledState();

        if (_uninstallOnly)
            ConfigureUninstallMode();
        else
            ConfigureNormalMode();
    }

    private void RefreshInstalledState()
    {
        _installed = _engine.GetInstalledApplication();
    }

    private void ConfigureNormalMode()
    {
        InstallOptionsPanel.Visibility = Visibility.Visible;

        if (_installed is null)
        {
            InstallPathBox.Text = InstallerEngine.DefaultInstallDirectory;
            InstallPathBox.IsReadOnly = false;
            DesktopShortcutCheckBox.IsChecked = false;
            StatusText.Text = "Ready to install.";
        }
        else
        {
            InstallPathBox.Text = _installed.InstallLocation;
            InstallPathBox.IsReadOnly = true;
            DesktopShortcutCheckBox.IsChecked = DesktopShortcutExists();

            StatusText.Text = IsCurrentVersionInstalled()
                ? $"OrbitCord {_installed.Version} is installed."
                : $"Update {_installed.Version} → {InstallerBuildInfo.Version} available.";
        }

        ApplyActionState();
    }

    private void ConfigureUninstallMode()
    {
        InstallOptionsPanel.Visibility = Visibility.Collapsed;
        StatusText.Text = _installed is null
            ? "OrbitCord is not installed."
            : $"Ready to uninstall OrbitCord {_installed.Version}.";
        ApplyActionState();
    }

    private bool IsCurrentVersionInstalled() =>
        _installed is not null &&
        string.Equals(_installed.Version, InstallerBuildInfo.Version, StringComparison.OrdinalIgnoreCase);

    private static bool DesktopShortcutExists()
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        return File.Exists(Path.Combine(desktop, "OrbitCord.lnk"));
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

    private async void InstallButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy || _installed is not null || _uninstallOnly) return;
        await RunInstallAsync();
    }

    private async void UpdateButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy || _installed is null || IsCurrentVersionInstalled() || _uninstallOnly) return;
        await RunInstallAsync();
    }

    private async void UninstallButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy || _installed is null) return;
        await RunUninstallAsync();
    }

    private async Task RunInstallAsync()
    {
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
            StatusText.Text = _installed is null
                ? "Done."
                : $"OrbitCord {_installed.Version} is ready.";
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

            if (IsVisible && !_uninstallOnly)
            {
                var finalStatus = StatusText.Text;
                ConfigureNormalMode();
                if (!string.IsNullOrWhiteSpace(finalStatus) &&
                    !string.Equals(finalStatus, "Cancelled.", StringComparison.Ordinal))
                {
                    StatusText.Text = finalStatus;
                }
            }
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

        SetBusy(true);
        _operationCts = new CancellationTokenSource();

        try
        {
            var progress = new Progress<InstallerProgress>(UpdateProgress);
            await _engine.UninstallAsync(progress, _operationCts.Token);
            InstallProgress.IsIndeterminate = false;
            InstallProgress.Value = 100;
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
            if (IsVisible) SetBusy(false);
        }
    }

    private void UpdateProgress(InstallerProgress update)
    {
        StatusText.Text = update.Message;

        if (update.Percent is { } percent)
        {
            InstallProgress.IsIndeterminate = false;
            InstallProgress.Value = Math.Clamp(percent, 0, 100);
        }
        else
        {
            InstallProgress.IsIndeterminate = true;
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
        UpdateButton.IsEnabled = !_busy && !_uninstallOnly && installed && !currentVersion;
        UninstallButton.IsEnabled = !_busy && installed;

        BrowseButton.IsEnabled = !_busy && !_uninstallOnly && !installed;
        InstallPathBox.IsEnabled = !_busy && !_uninstallOnly && !installed;
        DesktopShortcutCheckBox.IsEnabled = !_busy && !_uninstallOnly;
        LaunchAfterInstallCheckBox.IsEnabled = !_busy && !_uninstallOnly;
        InstallOptionsPanel.IsEnabled = !_busy && !_uninstallOnly;
    }

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
            _operationCts?.Cancel();
            return;
        }

        Close();
    }
}
