using OrbitCord.Core;

namespace OrbitCord.Core.Tests;

public sealed class MemoryPolicyTests
{
    [Theory]
    [InlineData(true, false, false, false)]
    [InlineData(false, false, false, false)]
    [InlineData(true, true, false, false)]
    [InlineData(false, true, false, true)]
    [InlineData(true, true, true, false)]
    [InlineData(false, true, true, true)]
    public void ActiveRuntimeUsesNormalAndSettledInactiveRuntimeUsesLow(
        bool isActive,
        bool startupSettled,
        bool gamingMode,
        bool expected)
    {
        Assert.Equal(expected, MemoryPolicy.UseLowMemoryTarget(isActive, startupSettled, gamingMode));
    }

    [Theory]
    [InlineData(127, 60, true, 45, false)]
    [InlineData(128, 0, true, 44, false)]
    [InlineData(128, 0, true, 45, true)]
    [InlineData(159, 112, true, 45, false)]
    [InlineData(160, 112, true, 45, true)]
    [InlineData(220, 180, true, 45, false)]
    [InlineData(220, 160, true, 45, true)]
    [InlineData(220, 160, false, 60, false)]
    public void CleanupUsesAdaptiveGrowthBudgetAndCooldown(
        int memoryMiB,
        int lastCleanupMiB,
        bool settled,
        int elapsedSeconds,
        bool expected)
    {
        var bytes = memoryMiB * 1024L * 1024L;
        var baseline = lastCleanupMiB * 1024L * 1024L;
        Assert.Equal(expected, MemoryPolicy.ShouldRequestCleanup(
            bytes,
            baseline,
            settled,
            TimeSpan.FromSeconds(elapsedSeconds)));
    }

    [Theory]
    [InlineData(383, false)]
    [InlineData(384, true)]
    [InlineData(600, true)]
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
