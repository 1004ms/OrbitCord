namespace OrbitCord.Core;

public static class SplashTiming
{
    public static TimeSpan MinimumVisible { get; } = TimeSpan.FromMilliseconds(3200);
    public static TimeSpan FadeIn { get; } = TimeSpan.FromMilliseconds(900);
    public static TimeSpan FadeOut { get; } = TimeSpan.FromMilliseconds(700);

    public static TimeSpan Remaining(TimeSpan elapsed, TimeSpan minimum)
        => elapsed >= minimum ? TimeSpan.Zero : minimum - elapsed;
}
