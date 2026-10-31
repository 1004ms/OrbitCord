namespace OrbitCord.Core;

public static class MemoryPolicy
{
    public const uint WindowsMemoryPriorityLow = 2;
    public const uint WindowsMemoryPriorityNormal = 5;

    // Keep the normal release footprint responsive to real growth without forcing
    // Chromium through GC/pressure cycles just because its steady-state baseline is
    // above an arbitrary absolute number.
    public const long SoftCleanupFloorBytes = 128L * 1024 * 1024;
    public const long CleanupGrowthBudgetBytes = 48L * 1024 * 1024;
    public const long HardTrimThresholdBytes = 384L * 1024 * 1024;
    public static readonly TimeSpan CleanupCooldown = TimeSpan.FromSeconds(45);

    // Discord performs a burst of module parsing/compilation during startup, and WebView2
    // Low is intended for inactive surfaces. Keep the active client at Normal for responsive
    // rendering; once startup settles, inactive/minimized windows can use the lean Low target.
    // gamingMode stays in the signature because callers/tests treat it as part of the policy API.
    public static bool UseLowMemoryTarget(bool isActive, bool startupSettled, bool gamingMode)
        => startupSettled && !isActive;

    public static bool ShouldRequestCleanup(
        long workingSetBytes,
        long lastCleanupWorkingSetBytes,
        bool startupSettled,
        TimeSpan sinceLastCleanup)
    {
        if (!startupSettled || sinceLastCleanup < CleanupCooldown) return false;
        if (workingSetBytes < SoftCleanupFloorBytes) return false;
        if (lastCleanupWorkingSetBytes <= 0) return true;

        return workingSetBytes - lastCleanupWorkingSetBytes >= CleanupGrowthBudgetBytes;
    }

    public static bool ShouldHardTrim(long workingSetBytes)
        => workingSetBytes >= HardTrimThresholdBytes;

    public static bool ShouldRenderWebSurface(bool isActive, bool isMinimized)
        => !isMinimized;

    public static uint WindowsProcessMemoryPriority(bool isActive, bool isMinimized)
        => (!isActive || isMinimized) ? WindowsMemoryPriorityLow : WindowsMemoryPriorityNormal;
}
