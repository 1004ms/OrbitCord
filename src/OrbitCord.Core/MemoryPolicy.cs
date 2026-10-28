namespace OrbitCord.Core;

public static class MemoryPolicy
{
    public const uint WindowsMemoryPriorityLow = 2;
    public const uint WindowsMemoryPriorityNormal = 5;

    public const long SoftCleanupThresholdBytes = 420L * 1024 * 1024;
    public const long HardTrimThresholdBytes = 600L * 1024 * 1024;
    public static readonly TimeSpan CleanupCooldown = TimeSpan.FromSeconds(20);

    // Discord performs a burst of module parsing/compilation during startup. Keeping
    // WebView2 in Low during that burst can cause discard/page-in churn. Bootstrap at
    // Normal, then return to the lean Low target once Discord has settled. Gaming mode
    // deliberately opts back into Normal while the window is active.
    public static bool UseLowMemoryTarget(bool isActive, bool startupSettled, bool gamingMode)
        => startupSettled && (!gamingMode || !isActive);

    public static bool ShouldRequestCleanup(long workingSetBytes, bool startupSettled, TimeSpan sinceLastCleanup)
        => startupSettled
            && workingSetBytes >= SoftCleanupThresholdBytes
            && sinceLastCleanup >= CleanupCooldown;

    public static bool ShouldHardTrim(long workingSetBytes)
        => workingSetBytes >= HardTrimThresholdBytes;

    public static bool ShouldRenderWebSurface(bool isActive, bool isMinimized)
        => !isMinimized;

    public static uint WindowsProcessMemoryPriority(bool isActive, bool isMinimized)
        => (!isActive || isMinimized) ? WindowsMemoryPriorityLow : WindowsMemoryPriorityNormal;
}
