using System.Diagnostics;
using System.Runtime.InteropServices;
using Microsoft.Web.WebView2.Core;

using OrbitCord.Core;

namespace OrbitCord.App;

internal static class WebViewProcessTuning
{
    private const int ProcessMemoryPriority = 0;
    private static readonly object CacheGate = new();
    private static readonly HashSet<int> _lastProcessIds = [];
    private static uint? _lastAppliedPriority;

    [StructLayout(LayoutKind.Sequential)]
    private struct MemoryPriorityInformation
    {
        public uint MemoryPriority;
    }

    [DllImport("kernel32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool SetProcessInformation(
        IntPtr hProcess,
        int processInformationClass,
        ref MemoryPriorityInformation processInformation,
        uint processInformationSize);

    [DllImport("psapi.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool EmptyWorkingSet(IntPtr hProcess);

    public static void ApplyMemoryPriority(CoreWebView2Environment? environment, uint priority)
    {
        if (environment is null) return;

        var processIds = TargetProcesses(environment)
            .Select(x => x.ProcessId)
            .Distinct()
            .ToArray();

        lock (CacheGate)
        {
            var currentIds = processIds.ToHashSet();
            if (_lastAppliedPriority == priority && currentIds.SetEquals(_lastProcessIds))
            {
                return;
            }

            foreach (var processId in processIds)
            {
                TrySetMemoryPriority(processId, priority);
            }

            _lastProcessIds.Clear();
            _lastProcessIds.UnionWith(currentIds);
            _lastAppliedPriority = priority;
        }
    }

    public static IReadOnlyList<ProcessPerformanceDetail> CaptureProcessMemoryDetails(CoreWebView2Environment? environment)
    {
        if (environment is null) return Array.Empty<ProcessPerformanceDetail>();

        var samples = new List<ProcessPerformanceDetail>();
        foreach (var info in TargetProcesses(environment))
        {
            try
            {
                using var process = Process.GetProcessById(info.ProcessId);
                process.Refresh();
                samples.Add(new ProcessPerformanceDetail(
                    info.ProcessId,
                    info.Kind.ToString(),
                    Math.Max(0, process.WorkingSet64),
                    Math.Max(0, process.PrivateMemorySize64),
                    Math.Max(0, process.TotalProcessorTime.TotalMilliseconds),
                    Math.Max(0, process.Threads.Count)));
            }
            catch
            {
                // WebView2 children can exit between enumeration and sampling.
            }
        }

        return samples;
    }

    public static long GetWorkingSetBytes(CoreWebView2Environment? environment)
    {
        if (environment is null) return 0;
        long total = 0;
        foreach (var info in TargetProcesses(environment))
        {
            try
            {
                using var process = Process.GetProcessById(info.ProcessId);
                total += Math.Max(0, process.WorkingSet64);
            }
            catch
            {
                // Child processes can exit between enumeration and sampling.
            }
        }
        return total;
    }

    public static string DescribeWorkingSets(CoreWebView2Environment? environment)
    {
        if (environment is null) return "none";
        var samples = new List<string>();
        foreach (var info in TargetProcesses(environment))
        {
            try
            {
                using var process = Process.GetProcessById(info.ProcessId);
                samples.Add($"{info.Kind}:{process.WorkingSet64 / 1024d / 1024d:0}MB");
            }
            catch
            {
                // Best-effort diagnostics only.
            }
        }
        return samples.Count == 0 ? "none" : string.Join(", ", samples);
    }

    public static int TrimWorkingSets(CoreWebView2Environment? environment)
    {
        if (environment is null) return 0;
        var trimmed = 0;
        foreach (var info in TargetProcesses(environment))
        {
            try
            {
                using var process = Process.GetProcessById(info.ProcessId);
                if (EmptyWorkingSet(process.Handle)) trimmed++;
            }
            catch
            {
                // A process may disappear or reject the trim request; continue with peers.
            }
        }
        return trimmed;
    }

    private static IReadOnlyList<CoreWebView2ProcessInfo> TargetProcesses(CoreWebView2Environment environment)
        => environment.GetProcessInfos()
            .Where(info => info.Kind is CoreWebView2ProcessKind.Browser
                or CoreWebView2ProcessKind.Renderer
                or CoreWebView2ProcessKind.Utility
                or CoreWebView2ProcessKind.Gpu)
            .ToArray();

    private static void TrySetMemoryPriority(int processId, uint priority)
    {
        try
        {
            using var process = Process.GetProcessById(processId);
            var info = new MemoryPriorityInformation { MemoryPriority = priority };
            _ = SetProcessInformation(
                process.Handle,
                ProcessMemoryPriority,
                ref info,
                (uint)Marshal.SizeOf<MemoryPriorityInformation>());
        }
        catch
        {
            // WebView2 child processes are short-lived; failure to reprioritize one
            // process is non-fatal and will be retried after the process set changes.
        }
    }
}
