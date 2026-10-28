using System.Globalization;
using OrbitCord.Core;

namespace OrbitCord.Core.Tests;

public sealed class PerformanceDiagnosticsTests
{
    [Fact]
    public void ReportIdentifiesAggregateAndPerKindPeaks()
    {
        var start = DateTimeOffset.Parse("2026-10-28T12:00:00Z");
        var samples = new[]
        {
            new PerformanceDiagnosticsSample(
                start.AddSeconds(1), "startup", true, false, false, "Normal",
                40L * 1024 * 1024, 30L * 1024 * 1024,
                [
                    new ProcessPerformanceDetail(10, "Browser", 100L * 1024 * 1024, 90L * 1024 * 1024, 120, 18),
                    new ProcessPerformanceDetail(11, "Renderer", 220L * 1024 * 1024, 200L * 1024 * 1024, 450, 24)
                ]),
            new PerformanceDiagnosticsSample(
                start.AddSeconds(5), "bootstrap-peak", true, false, true, "Low",
                45L * 1024 * 1024, 35L * 1024 * 1024,
                [
                    new ProcessPerformanceDetail(10, "Browser", 140L * 1024 * 1024, 110L * 1024 * 1024, 250, 20),
                    new ProcessPerformanceDetail(11, "Renderer", 620L * 1024 * 1024, 580L * 1024 * 1024, 950, 34)
                ])
        };

        var report = PerformanceDiagnosticsReport.Format(start, start.AddSeconds(10), samples);

        Assert.Contains("Peak WebView working set: 760.0 MB", report);
        Assert.Contains("Peak OrbitCord + WebView working set: 805.0 MB", report);
        Assert.Contains("Peak by process kind:", report);
        Assert.Contains("Renderer: 620.0 MB working", report);
        Assert.Contains("Private=580.0MB", report);
        Assert.Contains("Threads=34", report);
        Assert.Contains("bootstrap-peak", report);
    }
    [Fact]
    public void ReportUsesInvariantDecimalSeparatorUnderItalianCulture()
    {
        var previousCulture = CultureInfo.CurrentCulture;
        try
        {
            CultureInfo.CurrentCulture = new CultureInfo("it-IT");
            var start = DateTimeOffset.Parse("2026-10-28T12:00:00Z", CultureInfo.InvariantCulture);
            var samples = new[]
            {
                new PerformanceDiagnosticsSample(
                    start, "locale-check", true, false, true, "Low",
                    0, 0,
                    [new ProcessPerformanceDetail(10, "Renderer", 1536 * 1024, 1024 * 1024, 0, 1)])
            };

            var report = PerformanceDiagnosticsReport.Format(start, start.AddSeconds(1), samples);

            Assert.Contains("Peak WebView working set: 1.5 MB", report);
            Assert.Contains("Renderer: 1.5 MB working / 1.0 MB private", report);
            Assert.DoesNotContain("1,5 MB", report);
        }
        finally
        {
            CultureInfo.CurrentCulture = previousCulture;
        }
    }

}

