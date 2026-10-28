using System.Diagnostics;
using Microsoft.Win32;
using System.IO;

namespace OrbitCord.Installer;

internal sealed class WindowsIntegration
{
    private const string UninstallRegistryPath = @"Software\Microsoft\Windows\CurrentVersion\Uninstall\OrbitCord";
    private const string StartMenuRelativePath = @"Microsoft\Windows\Start Menu\Programs";

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
        CreateShortcut(Path.Combine(programs, "OrbitCord.lnk"), executablePath);
    }

    public void SetDesktopShortcut(string executablePath, bool enabled)
    {
        var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
        var shortcut = Path.Combine(desktop, "OrbitCord.lnk");
        if (enabled)
            CreateShortcut(shortcut, executablePath);
        else if (File.Exists(shortcut))
            File.Delete(shortcut);
    }

    public void RemoveShortcuts()
    {
        var startMenu = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
            StartMenuRelativePath,
            "OrbitCord.lnk");
        var desktop = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory), "OrbitCord.lnk");

        TryDeleteFile(startMenu);
        TryDeleteFile(desktop);
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

    private static void CreateShortcut(string shortcutPath, string executablePath)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(shortcutPath)!);
        var shellType = Type.GetTypeFromProgID("WScript.Shell")
                        ?? throw new InvalidOperationException("Windows Script Host is unavailable.");
        dynamic shell = Activator.CreateInstance(shellType)
                        ?? throw new InvalidOperationException("Could not create Windows Script Host.");
        dynamic shortcut = shell.CreateShortcut(shortcutPath);
        shortcut.TargetPath = executablePath;
        shortcut.WorkingDirectory = Path.GetDirectoryName(executablePath);
        shortcut.IconLocation = $"{executablePath},0";
        shortcut.Description = "OrbitCord";
        shortcut.Save();
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
