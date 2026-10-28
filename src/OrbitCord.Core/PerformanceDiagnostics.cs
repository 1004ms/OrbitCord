using System.Globalization;

namespace OrbitCord.Core;

public sealed record ProcessPerformanceDetail(
    int ProcessId,
    string Kind,
    long WorkingSetBytes,
    long PrivateMemoryBytes,
    double CpuTimeMilliseconds,
    int ThreadCount);

public sealed record PerformanceDiagnosticsSample(
    DateTimeOffset CapturedAt,
    string Reason,
    bool WindowActive,
    bool WindowMinimized,
    bool StartupSettled,
    string MemoryTarget,
    long HostWorkingSetBytes,
    long HostPrivateMemoryBytes,
    IReadOnlyList<ProcessPerformanceDetail> WebViewProcesses)
{
    public long WebViewWorkingSetBytes => WebViewProcesses.Sum(x => x.WorkingSetBytes);
    public long WebViewPrivateMemoryBytes => WebViewProcesses.Sum(x => x.PrivateMemoryBytes);
    public long AggregateWorkingSetBytes => HostWorkingSetBytes + WebViewWorkingSetBytes;
}

public static class PerformanceDiagnosticsReport
{
    public static string Format(
        DateTimeOffset startedAt,
        DateTimeOffset endedAt,
        IEnumerable<PerformanceDiagnosticsSample> samples)
    {
        var list = samples.OrderBy(x => x.CapturedAt).ToArray();
        var lines = new List<string>
        {
            "ORBITCORD PERFORMANCE DIAGNOSTICS",
            $"Session started: {startedAt:O}",
            $"Session ended: {endedAt:O}",
            $"Duration: {(endedAt - startedAt):c}",
            $"Samples: {list.Length}",
            ""
        };

        if (list.Length == 0)
        {
            lines.Add("No performance samples were captured.");
            return string.Join(Environment.NewLine, lines);
        }

        var peakWebView = list.MaxBy(x => x.WebViewWorkingSetBytes)!;
        var peakAggregate = list.MaxBy(x => x.AggregateWorkingSetBytes)!;
        var peakPrivate = list.MaxBy(x => x.WebViewPrivateMemoryBytes)!;

        lines.Add("SUMMARY");
        lines.Add($"Peak WebView working set: {MbText(peakWebView.WebViewWorkingSetBytes)} MB @ {peakWebView.CapturedAt:O} ({peakWebView.Reason})");
        lines.Add($"Peak WebView private memory: {MbText(peakPrivate.WebViewPrivateMemoryBytes)} MB @ {peakPrivate.CapturedAt:O} ({peakPrivate.Reason})");
        lines.Add($"Peak OrbitCord + WebView working set: {MbText(peakAggregate.AggregateWorkingSetBytes)} MB @ {peakAggregate.CapturedAt:O} ({peakAggregate.Reason})");
        lines.Add("");
        lines.Add("Peak by process kind:");

        foreach (var group in list
                     .SelectMany(sample => sample.WebViewProcesses.Select(process => (sample, process)))
                     .GroupBy(x => x.process.Kind, StringComparer.OrdinalIgnoreCase)
                     .OrderBy(x => x.Key, StringComparer.OrdinalIgnoreCase))
        {
            var peak = group.MaxBy(x => x.process.WorkingSetBytes);
            if (peak.process is null) continue;
            lines.Add($"  {group.Key}: {MbText(peak.process.WorkingSetBytes)} MB working / {MbText(peak.process.PrivateMemoryBytes)} MB private / PID {peak.process.ProcessId} @ {peak.sample.CapturedAt:O}");
        }

        lines.Add("");
        lines.Add("PEAK WEBVIEW SAMPLE");
        lines.Add(FormatSample(peakWebView, includeProcesses: true));
        lines.Add("");
        lines.Add("TIMELINE");
        lines.Add("Timestamp | Reason | Active | Minimized | StartupSettled | Target | HostWS | HostPrivate | WebWS | WebPrivate | WebProcesses");

        foreach (var sample in list)
        {
            lines.Add(FormatSample(sample, includeProcesses: true));
        }

        lines.Add("");
        lines.Add("Notes:");
        lines.Add("- Working set is physical memory currently resident for each process; it can fall after OS trimming without allocations being freed.");
        lines.Add("- Private memory is more useful for spotting retained allocations that remain owned by a process.");
        lines.Add("- CPU values are cumulative process CPU milliseconds at sample time, not instantaneous CPU percentages.");
        return string.Join(Environment.NewLine, lines);
    }

    private static string FormatSample(PerformanceDiagnosticsSample sample, bool includeProcesses)
    {
        var processText = includeProcesses
            ? string.Join(", ", sample.WebViewProcesses
                .OrderByDescending(x => x.WorkingSetBytes)
                .Select(x => $"{x.Kind}[{x.ProcessId}] WS={MbText(x.WorkingSetBytes)}MB Private={MbText(x.PrivateMemoryBytes)}MB CPU={x.CpuTimeMilliseconds.ToString("0", CultureInfo.InvariantCulture)}ms Threads={x.ThreadCount}"))
            : string.Empty;

        return string.Join(" | ",
            sample.CapturedAt.ToString("O"),
            sample.Reason,
            sample.WindowActive ? "yes" : "no",
            sample.WindowMinimized ? "yes" : "no",
            sample.StartupSettled ? "yes" : "no",
            sample.MemoryTarget,
            $"{MbText(sample.HostWorkingSetBytes)} MB",
            $"{MbText(sample.HostPrivateMemoryBytes)} MB",
            $"{MbText(sample.WebViewWorkingSetBytes)} MB",
            $"{MbText(sample.WebViewPrivateMemoryBytes)} MB",
            processText);
    }

    private static double Mb(long bytes) => bytes / 1024d / 1024d;

    private static string MbText(long bytes) => Mb(bytes).ToString("0.0", CultureInfo.InvariantCulture);
}
