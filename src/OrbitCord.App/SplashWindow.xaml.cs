using System.Diagnostics;
using System.IO;
using System.Windows;
using System.Windows.Media.Imaging;
using System.Windows.Media.Animation;
using OrbitCord.Core;

namespace OrbitCord.App;

public partial class SplashWindow : Window
{
    private readonly Stopwatch _visibleFor = Stopwatch.StartNew();

    public SplashWindow()
    {
        InitializeComponent();
        ApplySelectedBranding();
        Loaded += (_, _) => PlayEntranceAnimation();
    }

    private void ApplySelectedBranding()
    {
        try
        {
            var store = new IconCustomizationStore();
            BrandNameText.Text = store.DisplayAppName;
            StatusText.Text = $"Booting {store.DisplayAppName}…";
            var path = store.GetSelectedIconPath();
            if (!File.Exists(path)) return;

            var bitmap = new BitmapImage();
            bitmap.BeginInit();
            bitmap.CacheOption = BitmapCacheOption.OnLoad;
            bitmap.UriSource = new Uri(path, UriKind.Absolute);
            bitmap.EndInit();
            bitmap.Freeze();
            SplashIcon.Source = bitmap;
        }
        catch
        {
            BrandNameText.Text = "OrbitCord";
            StatusText.Text = "Booting OrbitCord…";
            SplashIcon.Source = new BitmapImage(new Uri("pack://application:,,,/Assets/orbitcord-logo.png", UriKind.Absolute));
        }
    }

    public void SetStatus(string message)
    {
        if (!Dispatcher.CheckAccess())
        {
            Dispatcher.Invoke(() => SetStatus(message));
            return;
        }

        StatusText.Text = message;
    }

    public async Task EnsureMinimumVisibleAsync()
    {
        var remaining = SplashTiming.Remaining(_visibleFor.Elapsed, SplashTiming.MinimumVisible);
        if (remaining > TimeSpan.Zero) await Task.Delay(remaining);
    }

    public async Task PlayExitAsync()
    {
        await EnsureMinimumVisibleAsync();

        var completion = new TaskCompletionSource<bool>(TaskCreationOptions.RunContinuationsAsynchronously);
        var duration = new Duration(SplashTiming.FadeOut);

        var brandFade = new DoubleAnimation(BrandPanel.Opacity, 0, duration)
        {
            FillBehavior = FillBehavior.Stop,
            EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
        };

        var windowFade = new DoubleAnimation(1, 0, duration)
        {
            FillBehavior = FillBehavior.Stop,
            EasingFunction = new QuadraticEase { EasingMode = EasingMode.EaseIn }
        };

        windowFade.Completed += (_, _) =>
        {
            BrandPanel.Opacity = 0;
            Opacity = 0;
            completion.TrySetResult(true);
        };

        BrandPanel.BeginAnimation(OpacityProperty, brandFade);
        BeginAnimation(OpacityProperty, windowFade);
        await completion.Task;
    }

    private void PlayEntranceAnimation()
    {
        var duration = new Duration(SplashTiming.FadeIn);
        var ease = new CubicEase { EasingMode = EasingMode.EaseOut };

        BrandPanel.BeginAnimation(
            OpacityProperty,
            new DoubleAnimation(0, 1, duration) { EasingFunction = ease });

        BrandScale.BeginAnimation(
            System.Windows.Media.ScaleTransform.ScaleXProperty,
            new DoubleAnimation(0.92, 1, duration) { EasingFunction = ease });
        BrandScale.BeginAnimation(
            System.Windows.Media.ScaleTransform.ScaleYProperty,
            new DoubleAnimation(0.92, 1, duration) { EasingFunction = ease });
    }
}
