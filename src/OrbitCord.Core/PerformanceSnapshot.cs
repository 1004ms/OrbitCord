using System.Globalization;

namespace OrbitCord.Core;

public sealed record ProcessMemorySample(int ProcessId, string Kind, long WorkingSetBytes);

public static class PerformanceSnapshot
{
    public static string Format(DateTimeOffset capturedAt, bool gamingMode, bool ultraLiteMode, string memoryTarget, bool webSurfaceVisible, IEnumerable<ProcessMemorySample> samples)
    {
        var list = samples.OrderByDescending(x => x.WorkingSetBytes).ToArray();
        var total = list.Sum(x => x.WorkingSetBytes);
        var lines = new List<string>
        {
            "ORBITCORD PERFORMANCE SNAPSHOT",
            $"Captured: {capturedAt:O}",
            $"Gaming mode: {(gamingMode ? "ON" : "OFF")}",
            $"Ultra Lite: {(ultraLiteMode ? "ON" : "OFF")}",
            $"Memory target: {memoryTarget}",
            $"Web surface: {(webSurfaceVisible ? "VISIBLE" : "HIDDEN")}",
            $"Processes: {list.Length}",
            $"Aggregate working set: {ToMb(total).ToString("0.0", CultureInfo.InvariantCulture)} MB",
            ""
        };

        foreach (var item in list)
        {
            lines.Add($"{item.Kind} PID {item.ProcessId}: {ToMb(item.WorkingSetBytes).ToString("0.0", CultureInfo.InvariantCulture)} MB");
        }

        lines.Add("");
        lines.Add("Note: working-set memory is sampled on demand; OrbitCord does not run a background profiler.");
        return string.Join(Environment.NewLine, lines);
    }

    private static double ToMb(long bytes) => bytes / 1024d / 1024d;
}
