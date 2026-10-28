using OrbitCord.Core;

namespace OrbitCord.Core.Tests;

public sealed class SplashTimingTests
{
    [Fact]
    public void SplashStaysVisibleUntilLongerOrbitCordMinimumDuration()
    {
        Assert.Equal(TimeSpan.FromMilliseconds(2200),
            SplashTiming.Remaining(TimeSpan.FromMilliseconds(1000), SplashTiming.MinimumVisible));
        Assert.Equal(TimeSpan.Zero,
            SplashTiming.Remaining(TimeSpan.FromMilliseconds(3300), SplashTiming.MinimumVisible));
    }

    [Fact]
    public void OrbitCordBootUsesSlowFadeInAndFadeOutAroundTheHold()
    {
        Assert.Equal(TimeSpan.FromMilliseconds(900), SplashTiming.FadeIn);
        Assert.Equal(TimeSpan.FromMilliseconds(700), SplashTiming.FadeOut);
        Assert.Equal(TimeSpan.FromMilliseconds(3200), SplashTiming.MinimumVisible);
        Assert.True(SplashTiming.MinimumVisible > SplashTiming.FadeIn + SplashTiming.FadeOut);
    }
}
