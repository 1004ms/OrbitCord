using OrbitCord.Core;

namespace OrbitCord.Core.Tests;

public sealed class MemoryPolicyTests
{
    [Theory]
    [InlineData(true, false, false, false)]
    [InlineData(false, false, false, false)]
    [InlineData(true, true, false, true)]
    [InlineData(false, true, false, true)]
    [InlineData(true, true, true, false)]
    [InlineData(false, true, true, true)]
    public void BootstrapUsesNormalThenSettledRuntimeReturnsToLowUnlessGamingIsActive(
        bool isActive,
        bool startupSettled,
        bool gamingMode,
        bool expected)
    {
        Assert.Equal(expected, MemoryPolicy.UseLowMemoryTarget(isActive, startupSettled, gamingMode));
    }

    [Theory]
    [InlineData(419, true, 30, false)]
    [InlineData(420, false, 30, false)]
    [InlineData(420, true, 19, false)]
    [InlineData(420, true, 20, true)]
    [InlineData(600, true, 20, true)]
    public void CleanupUsesThresholdAndCooldown(int memoryMiB, bool settled, int elapsedSeconds, bool expected)
    {
        var bytes = memoryMiB * 1024L * 1024L;
        Assert.Equal(expected, MemoryPolicy.ShouldRequestCleanup(bytes, settled, TimeSpan.FromSeconds(elapsedSeconds)));
    }

    [Theory]
    [InlineData(599, false)]
    [InlineData(600, true)]
    [InlineData(900, true)]
    public void HardTrimStartsAtHighWaterMark(int memoryMiB, bool expected)
    {
        Assert.Equal(expected, MemoryPolicy.ShouldHardTrim(memoryMiB * 1024L * 1024L));
    }

    [Theory]
    [InlineData(true, false, true)]
    [InlineData(false, false, true)]
    [InlineData(true, true, false)]
    [InlineData(false, true, false)]
    public void WebSurfaceOnlyStopsRenderingWhenMinimized(bool isActive, bool isMinimized, bool expected)
    {
        Assert.Equal(expected, MemoryPolicy.ShouldRenderWebSurface(isActive, isMinimized));
    }

    [Theory]
    [InlineData(true, false, 5u)]
    [InlineData(false, false, 2u)]
    [InlineData(true, true, 2u)]
    [InlineData(false, true, 2u)]
    public void BackgroundWebViewProcessesUseLowWindowsMemoryPriority(bool isActive, bool isMinimized, uint expected)
    {
        Assert.Equal(expected, MemoryPolicy.WindowsProcessMemoryPriority(isActive, isMinimized));
    }
}
