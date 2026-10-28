using OrbitCord.Core;

namespace OrbitCord.Core.Tests;

public sealed class PerformanceSnapshotTests
{
    [Fact]
    public void SnapshotAggregatesWorkingSetWithoutClaimingFps()
    {
        var text = PerformanceSnapshot.Format(
            DateTimeOffset.Parse("2026-10-23T00:00:00Z"),
            true,
            true,
            "LOW (locked)",
            false,
            [
                new ProcessMemorySample(1, "Host", 100L * 1024 * 1024),
                new ProcessMemorySample(2, "Renderer", 250L * 1024 * 1024)
            ]);

        Assert.Contains("ORBITCORD PERFORMANCE SNAPSHOT", text);
        Assert.Contains("Aggregate working set: 350.0 MB", text);
        Assert.Contains("Gaming mode: ON", text);
        Assert.Contains("Ultra Lite: ON", text);
        Assert.Contains("Memory target: LOW (locked)", text);
        Assert.Contains("Web surface: HIDDEN", text);
        Assert.DoesNotContain("FPS gain", text);
    }
}
