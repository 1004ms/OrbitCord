using System.Windows;

namespace OrbitCord.Installer;

public partial class App : Application
{
    protected override void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);
        var uninstallOnly = e.Args.Any(arg => string.Equals(arg, "--uninstall", StringComparison.OrdinalIgnoreCase));
        var window = new MainWindow(uninstallOnly);
        MainWindow = window;
        window.Show();
    }
}
