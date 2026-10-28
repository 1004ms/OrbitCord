using OrbitCord.Core;

namespace OrbitCord.Core.Tests;

public sealed class GamingCssTests
{
    [Fact]
    public void GamingCssIsReversible()
    {
        Assert.Contains(GamingCss.ElementId, GamingCss.EnableScript);
        Assert.Contains("animation-duration", GamingCss.EnableScript);
        Assert.Contains(GamingCss.ElementId, GamingCss.DisableScript);
        Assert.Contains("remove", GamingCss.DisableScript);
    }
}
