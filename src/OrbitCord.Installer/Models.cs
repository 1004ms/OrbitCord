namespace OrbitCord.Installer;

internal sealed record ReleaseAsset(string Name, Uri DownloadUri);

internal sealed record ReleaseDescriptor(string TagName, IReadOnlyDictionary<string, ReleaseAsset> Assets);

internal sealed record InstalledApplicationInfo(string InstallLocation, string Version);

internal sealed record InstallOptions(
    string InstallDirectory,
    bool CreateDesktopShortcut,
    bool LaunchAfterInstall);

internal sealed record InstallerProgress(string Message, double? Percent = null);
