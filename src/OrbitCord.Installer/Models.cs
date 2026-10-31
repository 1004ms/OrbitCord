namespace OrbitCord.Installer;

internal sealed record ReleaseAsset(string Name, Uri DownloadUri);

internal sealed record ReleaseDescriptor(string TagName, IReadOnlyDictionary<string, ReleaseAsset> Assets)
{
    public string Version
    {
        get
        {
            var tag = (TagName ?? string.Empty).Trim();
            if (tag.StartsWith('v') || tag.StartsWith('V')) tag = tag[1..];
            return string.IsNullOrWhiteSpace(tag) ? "0.0.0" : tag;
        }
    }
}

internal sealed record InstalledApplicationInfo(string InstallLocation, string Version);

internal sealed record InstallOptions(
    string InstallDirectory,
    bool CreateDesktopShortcut,
    bool LaunchAfterInstall);

internal sealed record InstallerProgress(string Message, double? Percent = null);
