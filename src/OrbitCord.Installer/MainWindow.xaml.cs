using System.Windows;
using System.Windows.Input;
using Microsoft.Win32;
using System.IO;

namespace OrbitCord.Installer;

public partial class MainWindow : Window
{
    private readonly InstallerEngine _engine;
    private readonly bool _uninstallOnly;
    private InstalledApplicationInfo? _installed;
    private CancellationTokenSource? _operationCts;
    private bool _busy;
    private bool _completed;

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
        VersionText.Text = InstallerBuildInfo.Version;
        _installed = _engine.GetInstalledApplication();

        if (_uninstallOnly)
        {
            ConfigureUninstallOnlyMode();
            return;
        }

        if (_installed is null)
        {
            InstallPathBox.Text = InstallerEngine.DefaultInstallDirectory;
            ModeText.Text = "Fresh install";
            StatusText.Text = "Ready to install.";
            return;
        }

        MaintenanceBadge.Visibility = Visibility.Visible;
        MaintenanceBadgeText.Text = $"OrbitCord {_installed.Version} is already installed";
        InstallPathBox.Text = _installed.InstallLocation;
        InstallPathBox.IsReadOnly = true;
        BrowseButton.IsEnabled = false;
        ModeText.Text = string.Equals(_installed.Version, InstallerBuildInfo.Version, StringComparison.OrdinalIgnoreCase)
            ? "Repair"
            : $"Update {_installed.Version} → {InstallerBuildInfo.Version}";
        PrimaryActionButton.Content = string.Equals(_installed.Version, InstallerBuildInfo.Version, StringComparison.OrdinalIgnoreCase)
            ? "Repair OrbitCord"
            : "Update OrbitCord";
        UninstallButton.Visibility = Visibility.Visible;
        StatusText.Text = "Your current installation will be backed up until the new files are in place.";
    }

    private void ConfigureUninstallOnlyMode()
    {
        HeadingText.Text = "Uninstall OrbitCord";
        SubheadingText.Text = "Remove the OrbitCord program while keeping your local profile and settings.";
        InstallOptionsPanel.Visibility = Visibility.Collapsed;
        SafetyText.Text = "Your data in %LocalAppData%\\OrbitCord is preserved. You can delete it manually later if you want a full reset.";
        MaintenanceBadge.Visibility = Visibility.Visible;
        MaintenanceBadgeText.Text = _installed is null ? "No registered installation found" : $"Installed version: {_installed.Version}";
        ModeText.Text = "Uninstall";
        InstallPathBox.Text = _installed?.InstallLocation ?? string.Empty;
        PrimaryActionButton.Content = "Uninstall OrbitCord";
        PrimaryActionButton.IsEnabled = _installed is not null;
        UninstallButton.Visibility = Visibility.Collapsed;
        StatusText.Text = _installed is null ? "OrbitCord is not registered as installed for this user." : "Ready to uninstall.";
    }

    private void BrowseButton_OnClick(object sender, RoutedEventArgs e)
    {
        var current = InstallPathBox.Text;
        var initial = Directory.Exists(current) ? current : Path.GetDirectoryName(current);
        var dialog = new OpenFolderDialog
        {
            Title = "Choose where to install OrbitCord",
            InitialDirectory = Directory.Exists(initial) ? initial : Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            Multiselect = false
        };

        if (dialog.ShowDialog() != true) return;
        var selected = Path.TrimEndingDirectorySeparator(dialog.FolderName);
        if (!string.Equals(Path.GetFileName(selected), "OrbitCord", StringComparison.OrdinalIgnoreCase))
            selected = Path.Combine(selected, "OrbitCord");
        InstallPathBox.Text = selected;
    }

    private async void PrimaryActionButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
        if (_uninstallOnly)
        {
            await RunUninstallAsync();
            return;
        }

        await RunInstallAsync();
    }

    private async void UninstallButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy) return;
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

            _installed = _engine.GetInstalledApplication();
            _completed = true;
            StatusText.Text = "OrbitCord installed successfully.";
            InstallProgress.Value = 100;
            PrimaryActionButton.Content = "Done";
            PrimaryActionButton.IsEnabled = true;
            PrimaryActionButton.Click -= PrimaryActionButton_OnClick;
            PrimaryActionButton.Click += (_, _) => Close();
            UninstallButton.Visibility = Visibility.Collapsed;
            InstallPathBox.IsReadOnly = true;
            BrowseButton.IsEnabled = false;
            DesktopShortcutCheckBox.IsEnabled = false;
            LaunchAfterInstallCheckBox.IsEnabled = false;
        }
        catch (OperationCanceledException)
        {
            StatusText.Text = "Setup cancelled.";
        }
        catch (Exception ex)
        {
            StatusText.Text = ex.Message;
            MessageBox.Show(this, ex.Message, "OrbitCord Setup", MessageBoxButton.OK, MessageBoxImage.Error);
        }
        finally
        {
            _operationCts.Dispose();
            _operationCts = null;
            SetBusy(false, preserveCompletionState: string.Equals((string?)PrimaryActionButton.Content, "Done", StringComparison.Ordinal));
        }
    }

    private async Task RunUninstallAsync()
    {
        if (!_uninstallOnly)
        {
            var confirmation = MessageBox.Show(
                this,
                "Remove OrbitCord? Your local profile and settings will be kept.",
                "Uninstall OrbitCord",
                MessageBoxButton.YesNo,
                MessageBoxImage.Question);
            if (confirmation != MessageBoxResult.Yes) return;
        }

        SetBusy(true);
        _operationCts = new CancellationTokenSource();
        try
        {
            var progress = new Progress<InstallerProgress>(UpdateProgress);
            await _engine.UninstallAsync(progress, _operationCts.Token);
            StatusText.Text = "OrbitCord was removed. Your local data was preserved.";
            InstallProgress.Value = 100;
            MessageBox.Show(this, StatusText.Text, "OrbitCord Setup", MessageBoxButton.OK, MessageBoxImage.Information);
            Close();
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

    private void SetBusy(bool busy, bool preserveCompletionState = false)
    {
        _busy = busy;
        if (!preserveCompletionState)
            PrimaryActionButton.IsEnabled = !busy && !_completed && (!_uninstallOnly || _installed is not null);
        UninstallButton.IsEnabled = !busy && !_completed;
        BrowseButton.IsEnabled = !busy && !_completed && _installed is null && !_uninstallOnly;
        InstallPathBox.IsEnabled = !busy && !_completed && _installed is null && !_uninstallOnly;
        DesktopShortcutCheckBox.IsEnabled = !busy && !_completed && !_uninstallOnly;
        LaunchAfterInstallCheckBox.IsEnabled = !busy && !_completed && !_uninstallOnly;
    }

    private void TitleBar_OnMouseLeftButtonDown(object sender, MouseButtonEventArgs e)
    {
        if (e.ButtonState == MouseButtonState.Pressed) DragMove();
    }

    private void MinimizeButton_OnClick(object sender, RoutedEventArgs e) => WindowState = WindowState.Minimized;

    private void CloseButton_OnClick(object sender, RoutedEventArgs e)
    {
        if (_busy)
        {
            var result = MessageBox.Show(this, "Cancel the current setup operation?", "OrbitCord Setup", MessageBoxButton.YesNo, MessageBoxImage.Question);
            if (result != MessageBoxResult.Yes) return;
            StatusText.Text = "Cancelling setup...";
            _operationCts?.Cancel();
            return;
        }
        Close();
    }
}
