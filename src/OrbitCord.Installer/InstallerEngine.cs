using System.Diagnostics;
using System.IO.Compression;
using System.Security.Cryptography;
using System.IO;

namespace OrbitCord.Installer;

internal sealed class InstallerEngine : IDisposable
{
    private const string ZipAssetName = "OrbitCord-win-x64.zip";
    private const string HashAssetName = "OrbitCord-win-x64.zip.sha256";
    private const string SetupFileName = "OrbitCord-Setup.exe";

    private readonly GitHubReleaseClient _releaseClient;
    private readonly WindowsIntegration _windows;

    public InstallerEngine(GitHubReleaseClient releaseClient, WindowsIntegration windows)
    {
        _releaseClient = releaseClient;
        _windows = windows;
    }

    public InstalledApplicationInfo? GetInstalledApplication()
    {
        return _windows.GetInstalledApplication() ?? ReadLegacyInstallMarker();
    }

    public Task<ReleaseDescriptor> GetLatestReleaseAsync(CancellationToken cancellationToken) =>
        _releaseClient.GetLatestReleaseAsync(cancellationToken);

    public bool HasDesktopShortcut(string executablePath) =>
        _windows.HasDesktopShortcut(executablePath);

    private static InstalledApplicationInfo? ReadLegacyInstallMarker()
    {
        var installDirectory = DefaultInstallDirectory;
        var versionFile = Path.Combine(installDirectory, ".orbitcord-version");
        var appExe = Path.Combine(installDirectory, "OrbitCord.exe");
        if (!File.Exists(versionFile) || !File.Exists(appExe)) return null;

        try
        {
            var version = File.ReadAllText(versionFile).Trim();
            return string.IsNullOrWhiteSpace(version)
                ? null
                : new InstalledApplicationInfo(installDirectory, version);
        }
        catch
        {
            return null;
        }
    }

    public static string DefaultInstallDirectory =>
        Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Programs", "OrbitCord");

    public async Task InstallAsync(
        InstallOptions options,
        IProgress<InstallerProgress>? progress,
        CancellationToken cancellationToken)
    {
        var installDirectory = NormalizeAndValidateInstallDirectory(options.InstallDirectory);
        ValidateExistingDirectory(installDirectory);
        EnsureParentWritable(installDirectory);

        progress?.Report(new InstallerProgress("Finding latest OrbitCord release...", 2));
        var release = await _releaseClient.GetLatestReleaseAsync(cancellationToken);
        if (!release.Assets.TryGetValue(ZipAssetName, out var zipAsset) ||
            !release.Assets.TryGetValue(HashAssetName, out var hashAsset))
        {
            throw new InvalidOperationException($"Release {release.TagName} is missing {ZipAssetName} or {HashAssetName}.");
        }

        var tempRoot = Path.Combine(Path.GetTempPath(), "OrbitCord-Setup-" + Guid.NewGuid().ToString("N"));
        var zipPath = Path.Combine(tempRoot, ZipAssetName);
        var hashPath = Path.Combine(tempRoot, HashAssetName);
        var payloadPath = Path.Combine(tempRoot, "payload");
        var backup = installDirectory + ".backup-" + DateTime.UtcNow.ToString("yyyyMMddHHmmss");
        var previousRegisteredInstall = _windows.GetInstalledApplication();
        var previousInstall = previousRegisteredInstall ?? ReadLegacyInstallMarker();
        var freshInstall = previousInstall is null;
        var movedExistingInstall = false;
        var installedNewPayload = false;

        Directory.CreateDirectory(tempRoot);
        try
        {
            await _releaseClient.DownloadFileAsync(
                zipAsset.DownloadUri, zipPath, "Downloading OrbitCord...", 5, 45, progress, cancellationToken);
            await _releaseClient.DownloadFileAsync(
                hashAsset.DownloadUri, hashPath, "Downloading checksum...", 50, 5, progress, cancellationToken);

            progress?.Report(new InstallerProgress("Verifying SHA-256...", 58));
            await VerifySha256Async(zipPath, hashPath, cancellationToken);

            progress?.Report(new InstallerProgress("Preparing files...", 64));
            Directory.CreateDirectory(payloadPath);
            ZipFile.ExtractToDirectory(zipPath, payloadPath, overwriteFiles: true);

            var payloadExe = Path.Combine(payloadPath, "OrbitCord.exe");
            if (!File.Exists(payloadExe))
                throw new InvalidOperationException("The release archive does not contain OrbitCord.exe.");

            cancellationToken.ThrowIfCancellationRequested();
            progress?.Report(new InstallerProgress("Closing OrbitCord...", 72));
            _windows.StopOrbitCordProcesses();

            if (Directory.Exists(backup)) Directory.Delete(backup, recursive: true);
            if (Directory.Exists(installDirectory))
            {
                Directory.Move(installDirectory, backup);
                movedExistingInstall = true;
            }

            Directory.CreateDirectory(Path.GetDirectoryName(installDirectory)!);
            Directory.CreateDirectory(installDirectory);
            installedNewPayload = true;
            CopyDirectory(payloadPath, installDirectory);

            var installedExe = Path.Combine(installDirectory, "OrbitCord.exe");
            var installedSetup = Path.Combine(installDirectory, SetupFileName);
            CopyCurrentSetup(installedSetup);
            await File.WriteAllTextAsync(
                Path.Combine(installDirectory, ".orbitcord-version"),
                release.Version,
                cancellationToken);

            progress?.Report(new InstallerProgress("Creating Windows shortcuts...", 88));
            // Repair stale OrbitCord-generated icon resources first. On a clean reinstall reset
            // every OrbitCord shortcut to the embedded EXE icon; on updates only migrate known
            // shell-v1/v2/v3 resources that could render as a blank document in Explorer.
            _windows.RepairShortcutAppearance(installedExe, freshInstall);
            _windows.CreateStartMenuShortcut(installedExe);
            _windows.SetDesktopShortcut(installedExe, options.CreateDesktopShortcut);
            _windows.RegisterUninstallEntry(installDirectory, release.Version, installedSetup, installedExe);

            if (movedExistingInstall && Directory.Exists(backup))
                Directory.Delete(backup, recursive: true);

            progress?.Report(new InstallerProgress("OrbitCord is installed.", 100));

            if (options.LaunchAfterInstall)
            {
                Process.Start(new ProcessStartInfo(installedExe)
                {
                    WorkingDirectory = installDirectory,
                    UseShellExecute = true
                });
            }
        }
        catch
        {
            try
            {
                if (installedNewPayload && Directory.Exists(installDirectory))
                    Directory.Delete(installDirectory, recursive: true);

                if (movedExistingInstall && Directory.Exists(backup))
                    Directory.Move(backup, installDirectory);

                if (previousRegisteredInstall is not null && Directory.Exists(previousRegisteredInstall.InstallLocation))
                {
                    var oldExe = Path.Combine(previousRegisteredInstall.InstallLocation, "OrbitCord.exe");
                    var oldSetup = Path.Combine(previousRegisteredInstall.InstallLocation, SetupFileName);
                    if (File.Exists(oldExe) && File.Exists(oldSetup))
                        _windows.RegisterUninstallEntry(previousRegisteredInstall.InstallLocation, previousRegisteredInstall.Version, oldSetup, oldExe);
                    else
                        _windows.RemoveUninstallEntry();
                }
                else
                {
                    // Legacy PowerShell installs had no Apps/Programs registry entry.
                    _windows.RemoveUninstallEntry();
                }
            }
            catch
            {
                // Preserve the original install exception; rollback is best effort.
            }

            throw;
        }
        finally
        {
            TryDeleteDirectory(tempRoot);
            if (Directory.Exists(backup) && Directory.Exists(installDirectory))
                TryDeleteDirectory(backup);
        }
    }

    public Task UninstallAsync(IProgress<InstallerProgress>? progress, CancellationToken cancellationToken)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var installed = GetInstalledApplication()
                        ?? throw new InvalidOperationException("OrbitCord is not registered as installed for this Windows user.");
        var installDirectory = NormalizeAndValidateInstallDirectory(installed.InstallLocation);
        var appExe = Path.Combine(installDirectory, "OrbitCord.exe");
        var marker = Path.Combine(installDirectory, ".orbitcord-version");
        if (!File.Exists(appExe) && !File.Exists(marker))
            throw new InvalidOperationException("The registered OrbitCord install folder does not look like a managed OrbitCord installation.");

        progress?.Report(new InstallerProgress("Closing OrbitCord...", 25));
        _windows.StopOrbitCordProcesses();
        _windows.RemoveShortcuts(appExe);
        _windows.RemoveUninstallEntry();

        progress?.Report(new InstallerProgress("Removing program files...", 70));
        var currentProcessPath = Environment.ProcessPath;
        if (!string.IsNullOrWhiteSpace(currentProcessPath) && IsPathInside(currentProcessPath, installDirectory))
            _windows.ScheduleDirectoryDeletion(installDirectory);
        else if (Directory.Exists(installDirectory))
            Directory.Delete(installDirectory, recursive: true);

        progress?.Report(new InstallerProgress("OrbitCord was removed. Your local OrbitCord data was preserved.", 100));
        return Task.CompletedTask;
    }

    internal static async Task VerifySha256Async(string filePath, string hashPath, CancellationToken cancellationToken)
    {
        var expectedText = await File.ReadAllTextAsync(hashPath, cancellationToken);
        var expected = expectedText.Trim().Split((char[]?)null, StringSplitOptions.RemoveEmptyEntries).FirstOrDefault();
        if (string.IsNullOrWhiteSpace(expected) || expected.Length != 64)
            throw new InvalidOperationException("The published SHA-256 file is invalid.");

        await using var stream = new FileStream(filePath, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, true);
        using var sha256 = SHA256.Create();
        var actualBytes = await sha256.ComputeHashAsync(stream, cancellationToken);
        var actual = Convert.ToHexString(actualBytes).ToLowerInvariant();
        if (!string.Equals(expected, actual, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"SHA-256 verification failed. Expected {expected.ToLowerInvariant()}, got {actual}.");
    }

    public void Dispose() => _releaseClient.Dispose();

    private static string NormalizeAndValidateInstallDirectory(string path)
    {
        if (string.IsNullOrWhiteSpace(path))
            throw new InvalidOperationException("Choose an installation folder.");

        var expanded = Environment.ExpandEnvironmentVariables(path.Trim().Trim('"'));
        var fullPath = Path.TrimEndingDirectorySeparator(Path.GetFullPath(expanded));
        var root = Path.TrimEndingDirectorySeparator(Path.GetPathRoot(fullPath) ?? string.Empty);
        if (string.Equals(fullPath, root, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("OrbitCord cannot be installed directly into a drive root.");

        var windowsDirectory = Path.TrimEndingDirectorySeparator(Environment.GetFolderPath(Environment.SpecialFolder.Windows));
        if (IsPathInside(fullPath, windowsDirectory))
            throw new InvalidOperationException("Choose a folder outside the Windows system directory.");

        return fullPath;
    }

    private static void ValidateExistingDirectory(string installDirectory)
    {
        if (!Directory.Exists(installDirectory)) return;
        if (!Directory.EnumerateFileSystemEntries(installDirectory).Any()) return;

        var looksLikeOrbitCord =
            File.Exists(Path.Combine(installDirectory, "OrbitCord.exe")) ||
            File.Exists(Path.Combine(installDirectory, ".orbitcord-version"));
        if (!looksLikeOrbitCord)
        {
            throw new InvalidOperationException(
                "The selected folder is not empty and is not an existing OrbitCord installation. Choose an empty folder or a dedicated OrbitCord folder.");
        }
    }

    private static void EnsureParentWritable(string installDirectory)
    {
        var probeDirectory = Directory.Exists(installDirectory)
            ? installDirectory
            : Path.GetDirectoryName(installDirectory) ?? throw new InvalidOperationException("Invalid installation folder.");
        Directory.CreateDirectory(probeDirectory);

        var probe = Path.Combine(probeDirectory, ".orbitcord-write-test-" + Guid.NewGuid().ToString("N"));
        try
        {
            File.WriteAllText(probe, "test");
        }
        catch (Exception ex)
        {
            throw new InvalidOperationException("OrbitCord cannot write to the selected folder. Choose another location or run with suitable permissions.", ex);
        }
        finally
        {
            try { if (File.Exists(probe)) File.Delete(probe); } catch { }
        }
    }


    private static void CopyDirectory(string sourceDirectory, string destinationDirectory)
    {
        Directory.CreateDirectory(destinationDirectory);
        foreach (var file in Directory.EnumerateFiles(sourceDirectory))
        {
            var destination = Path.Combine(destinationDirectory, Path.GetFileName(file));
            File.Copy(file, destination, overwrite: true);
        }

        foreach (var directory in Directory.EnumerateDirectories(sourceDirectory))
        {
            var destination = Path.Combine(destinationDirectory, Path.GetFileName(directory));
            CopyDirectory(directory, destination);
        }
    }

    private static void CopyCurrentSetup(string destination)
    {
        var source = Environment.ProcessPath
                     ?? throw new InvalidOperationException("Could not determine the setup executable path.");
        if (string.Equals(Path.GetFullPath(source), Path.GetFullPath(destination), StringComparison.OrdinalIgnoreCase))
            return;
        File.Copy(source, destination, overwrite: true);
    }

    private static bool IsPathInside(string path, string directory)
    {
        var fullPath = Path.GetFullPath(path);
        var fullDirectory = Path.TrimEndingDirectorySeparator(Path.GetFullPath(directory));
        if (string.Equals(fullPath, fullDirectory, StringComparison.OrdinalIgnoreCase)) return true;
        return fullPath.StartsWith(fullDirectory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
    }

    private static void TryDeleteDirectory(string directory)
    {
        try
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
        catch
        {
            // Temporary cleanup is best effort.
        }
    }
}
