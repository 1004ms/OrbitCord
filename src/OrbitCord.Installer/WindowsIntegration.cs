using System.Diagnostics;
using Microsoft.Win32;
using System.IO;
using System.Runtime.InteropServices;

namespace OrbitCord.Installer;

internal sealed class WindowsIntegration
{
    private const string UninstallRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\OrbitCord";
    private const string StartMenuRelativePath = @"Microsoft\Windows\Start Menu\Programs";
    private const uint ShcneUpdateItem = 0x00002000;
    private const uint ShcnfPathW = 0x0005;

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern void SHChangeNotify(uint wEventId, uint uFlags, string? dwItem1, string? dwItem2);

    public InstalledApplicationInfo? GetInstalledApplication()
    {
        using var key = Registry.CurrentUser.OpenSubKey(UninstallRegistryPath, writable: false);
        var installLocation = key?.GetValue("InstallLocation") as string;
        var displayVersion = key?.GetValue("DisplayVersion") as string;
        if (string.IsNullOrWhiteSpace(installLocation) || string.IsNullOrWhiteSpace(displayVersion))
            return null;

        return new InstalledApplicationInfo(installLocation, displayVersion);
    }

    public void StopOrbitCordProcesses()
    {
        foreach (var process in Process.GetProcessesByName("OrbitCord"))
        {
            try
            {
                process.Kill(entireProcessTree: true);
                process.WaitForExit(5000);
            }
            catch
            {
                // A process may exit on its own between enumeration and termination.
            }
            finally
            {
                process.Dispose();
            }
        }
    }

    public void CreateStartMenuShortcut(string executablePath)
    {
        var programs = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), StartMenuRelativePath);
        if (FindShortcutTargeting(programs, executablePath) is not null) return;
        CreateShortcut(Path.Combine(programs, "OrbitCord.lnk"), executablePath);
    }

    public bool HasDesktopShortcut(string executablePath)
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        return FindShortcutTargeting(desktop, executablePath) is not null;
    }

    public void SetDesktopShortcut(string executablePath, bool enabled)
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        if (enabled)
        {
            if (FindShortcutTargeting(desktop, executablePath) is null)
                CreateShortcut(Path.Combine(desktop, "OrbitCord.lnk"), executablePath);
            return;
        }

        RemoveShortcutsTargeting(desktop, executablePath);
    }

    public void RepairShortcutAppearance(string executablePath, bool resetAll)
    {
        var startMenu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            StartMenuRelativePath);
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var pinnedTaskbar = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar");

        RepairShortcutFolder(startMenu, executablePath, resetAll);
        RepairShortcutFolder(desktop, executablePath, resetAll);
        RepairShortcutFolder(pinnedTaskbar, executablePath, resetAll);
    }

    public void RemoveShortcuts(string executablePath)
    {
        var startMenu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            StartMenuRelativePath);
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var pinnedTaskbar = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar");

        RemoveShortcutsTargeting(startMenu, executablePath);
        RemoveShortcutsTargeting(desktop, executablePath);
        RemoveShortcutsTargeting(pinnedTaskbar, executablePath);

        // Also clean the historical fixed names in case one is damaged and can no longer
        // be inspected through WScript.Shell.
        TryDeleteFile(Path.Combine(startMenu, "OrbitCord.lnk"));
        TryDeleteFile(Path.Combine(desktop, "OrbitCord.lnk"));
    }

    public void RegisterUninstallEntry(string installDirectory, string version, string setupExecutable, string appExecutable)
    {
        using var key = Registry.CurrentUser.CreateSubKey(UninstallRegistryPath, writable: true)
                        ?? throw new InvalidOperationException("Unable to create the OrbitCord uninstall registry key.");

        key.SetValue("DisplayName", "OrbitCord");
        key.SetValue("DisplayVersion", version);
        key.SetValue("Publisher", "OrbitCord contributors");
        key.SetValue("InstallLocation", installDirectory);
        key.SetValue("DisplayIcon", $"\"{appExecutable}\",0");
        key.SetValue("UninstallString", $"\"{setupExecutable}\" --uninstall");
        key.SetValue("URLInfoAbout", InstallerBuildInfo.RepositoryUrl);
        key.SetValue("NoModify", 1, RegistryValueKind.DWord);
        key.SetValue("NoRepair", 1, RegistryValueKind.DWord);

        try
        {
            var estimatedSizeKb = Directory.EnumerateFiles(installDirectory, "*", SearchOption.AllDirectories)
                .Sum(file => new FileInfo(file).Length) / 1024L;
            key.SetValue("EstimatedSize", (int)Math.Min(int.MaxValue, estimatedSizeKb), RegistryValueKind.DWord);
        }
        catch
        {
            // EstimatedSize is optional metadata.
        }
    }

    public void RemoveUninstallEntry()
    {
        try
        {
            Registry.CurrentUser.DeleteSubKeyTree(UninstallRegistryPath, throwOnMissingSubKey: false);
        }
        catch
        {
            // Cleanup should continue even if the registry entry was already removed.
        }
    }

    public void ScheduleDirectoryDeletion(string directory)
    {
        var escaped = directory.Replace("\"", "\"\"");
        var arguments = $"/d /c ping 127.0.0.1 -n 3 > nul & rmdir /s /q \"{escaped}\"";
        Process.Start(new ProcessStartInfo("cmd.exe", arguments)
        {
            CreateNoWindow = true,
            UseShellExecute = false,
            WindowStyle = ProcessWindowStyle.Hidden
        });
    }

    private static string? FindShortcutTargeting(string folder, string executablePath)
    {
        if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder)) return null;
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType is null) return null;

        object? shellObject = null;
        try
        {
            shellObject = Activator.CreateInstance(shellType);
            if (shellObject is null) return null;
            dynamic shell = shellObject;

            foreach (var path in Directory.EnumerateFiles(folder, "*.lnk", SearchOption.TopDirectoryOnly))
            {
                object? shortcutObject = null;
                try
                {
                    shortcutObject = shell.CreateShortcut(path);
                    dynamic shortcut = shortcutObject;
                    if (PathsEqual((string?)shortcut.TargetPath, executablePath))
                        return path;
                }
                catch
                {
                    // Ignore stale or unreadable shortcuts.
                }
                finally
                {
                    ReleaseComObject(shortcutObject);
                }
            }
        }
        finally
        {
            ReleaseComObject(shellObject);
        }

        return null;
    }

    private static void RemoveShortcutsTargeting(string folder, string executablePath)
    {
        while (FindShortcutTargeting(folder, executablePath) is { } shortcut)
        {
            try { File.Delete(shortcut); }
            catch { break; }
        }
    }

    private static void RepairShortcutFolder(string folder, string executablePath, bool resetAll)
    {
        if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder)) return;
        var shellType = Type.GetTypeFromProgID("WScript.Shell");
        if (shellType is null) return;

        object? shellObject = null;
        try
        {
            shellObject = Activator.CreateInstance(shellType);
            if (shellObject is null) return;
            dynamic shell = shellObject;

            foreach (var path in Directory.EnumerateFiles(folder, "*.lnk", SearchOption.TopDirectoryOnly))
            {
                object? shortcutObject = null;
                try
                {
                    shortcutObject = shell.CreateShortcut(path);
                    dynamic shortcut = shortcutObject;
                    if (!PathsEqual((string?)shortcut.TargetPath, executablePath)) continue;

                    var iconLocation = ((string?)shortcut.IconLocation ?? string.Empty).Trim();
                    var legacyOrbitCordIcon = iconLocation.Contains(@"\OrbitCord\Customization\ShellIcons\shell-v1-", StringComparison.OrdinalIgnoreCase)
                        || iconLocation.Contains(@"\OrbitCord\Customization\ShellIcons\shell-v2-", StringComparison.OrdinalIgnoreCase)
                        || iconLocation.Contains(@"\OrbitCord\Customization\ShellIcons\shell-v3-", StringComparison.OrdinalIgnoreCase)
                        || iconLocation.Contains(@"\OrbitCord\Customization\ShellIcons\shell-v4-", StringComparison.OrdinalIgnoreCase);
                    if (!resetAll && !legacyOrbitCordIcon) continue;

                    shortcut.IconLocation = $"{executablePath},0";
                    // Preserve the visible/custom name. Recovery is about a stale icon path only.
                    shortcut.Save();
                    try { SHChangeNotify(ShcneUpdateItem, ShcnfPathW, path, null); } catch { }
                }
                catch
                {
                    // A stale shortcut must never block installation.
                }
                finally
                {
                    ReleaseComObject(shortcutObject);
                }
            }
        }
        finally
        {
            ReleaseComObject(shellObject);
        }
    }

    private static bool PathsEqual(string? left, string? right)
    {
        if (string.IsNullOrWhiteSpace(left) || string.IsNullOrWhiteSpace(right)) return false;
        try
        {
            var a = Path.GetFullPath(Environment.ExpandEnvironmentVariables(left.Trim().Trim('"')));
            var b = Path.GetFullPath(Environment.ExpandEnvironmentVariables(right.Trim().Trim('"')));
            return string.Equals(a, b, StringComparison.OrdinalIgnoreCase);
        }
        catch
        {
            return string.Equals(left.Trim().Trim('"'), right.Trim().Trim('"'), StringComparison.OrdinalIgnoreCase);
        }
    }

    private static void ReleaseComObject(object? value)
    {
        if (value is null) return;
        try
        {
            if (Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value);
        }
        catch
        {
            // Best effort COM cleanup.
        }
    }

    private static void CreateShortcut(string shortcutPath, string executablePath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(shortcutPath)!);
        var shellType = Type.GetTypeFromProgID("WScript.Shell")
                        ?? throw new InvalidOperationException("Windows Script Host is unavailable.");
        object? shellObject = null;
        object? shortcutObject = null;
        try
        {
            shellObject = Activator.CreateInstance(shellType)
                          ?? throw new InvalidOperationException("Could not create Windows Script Host.");
            dynamic shell = shellObject;
            shortcutObject = shell.CreateShortcut(shortcutPath);
            dynamic shortcut = shortcutObject;
            shortcut.TargetPath = executablePath;
            shortcut.WorkingDirectory = Path.GetDirectoryName(executablePath);
            shortcut.IconLocation = $"{executablePath},0";
            shortcut.Description = "OrbitCord";
            shortcut.Save();
            try { SHChangeNotify(ShcneUpdateItem, ShcnfPathW, shortcutPath, null); } catch { }
        }
        finally
        {
            ReleaseComObject(shortcutObject);
            ReleaseComObject(shellObject);
        }
    }

    private static void TryDeleteFile(string path)
    {
        try
        {
            if (File.Exists(path)) File.Delete(path);
        }
        catch
        {
            // Best effort cleanup.
        }
    }
}
