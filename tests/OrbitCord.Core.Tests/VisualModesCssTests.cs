using OrbitCord.Core;

namespace OrbitCord.Core.Tests;

public sealed class VisualModesCssTests
{
    [Fact]
    public void BaseLiteCssHasStableMarkerAndIsReversible()
    {
        Assert.Contains(VisualModesCss.BaseElementId, VisualModesCss.EnableBaseScript);
        Assert.Contains("backdrop-filter", VisualModesCss.EnableBaseScript);
        Assert.Contains(VisualModesCss.BaseElementId, VisualModesCss.DisableBaseScript);
    }

    [Fact]
    public void UltraLiteCssHasStableMarkerAndTargetsHeavyEffects()
    {
        Assert.Contains(VisualModesCss.UltraElementId, VisualModesCss.EnableUltraScript);
        Assert.Contains("box-shadow", VisualModesCss.EnableUltraScript);
        Assert.Contains("filter", VisualModesCss.EnableUltraScript);
        Assert.Contains(VisualModesCss.UltraElementId, VisualModesCss.DisableUltraScript);
    }
}
