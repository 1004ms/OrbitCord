using System.Windows;
using System.Windows.Threading;

namespace OrbitCord.App;

public partial class App : Application
{
    private readonly FileLogger _logger = new();

    protected override async void OnStartup(StartupEventArgs e)
    {
        base.OnStartup(e);

        DispatcherUnhandledException += OnDispatcherUnhandledException;
        AppDomain.CurrentDomain.UnhandledException += (_, args) =>
            _logger.Write($"Unhandled domain exception: {args.ExceptionObject}");
        TaskScheduler.UnobservedTaskException += (_, args) =>
        {
            _logger.Write($"Unobserved task exception: {args.Exception}");
            args.SetObserved();
        };

        var splash = new SplashWindow();
        splash.Show();
        await Dispatcher.Yield(DispatcherPriority.Background);

        var main = new MainWindow(_logger);
        MainWindow = main;
        main.PrepareForBackgroundPreload();
        main.Show();

        try
        {
            splash.SetStatus("Starting Microsoft Edge WebView2…");
            await main.InitializeAsync(splash.SetStatus);
            splash.SetStatus("Discord is ready.");

            // The visible launch sequence is deliberately strict:
            // splash only -> fade out completely -> reveal Discord.
            await splash.PlayExitAsync();
            splash.Close();
            main.RevealAfterSplash();
        }
        catch (Exception ex)
        {
            _logger.Write($"Startup failed: {ex}");
            splash.SetStatus("Startup failed — check the OrbitCord log.");
            await splash.EnsureMinimumVisibleAsync();
            MessageBox.Show(
                $"OrbitCord could not start.\n\n{ex.Message}\n\nLog: {_logger.LogPath}",
                "OrbitCord startup error",
                MessageBoxButton.OK,
                MessageBoxImage.Error);
            splash.Close();
            main.Close();
            Shutdown(1);
        }
    }

    private void OnDispatcherUnhandledException(object sender, DispatcherUnhandledExceptionEventArgs e)
    {
        _logger.Write($"Dispatcher exception: {e.Exception}");
    }
}
