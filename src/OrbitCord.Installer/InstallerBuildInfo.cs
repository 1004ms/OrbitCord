using System.Reflection;

namespace OrbitCord.Installer;

internal static class InstallerBuildInfo
{
    public static string Version => ReadMetadata("OrbitCordVersion")
        ?? throw new InvalidOperationException("OrbitCordVersion build metadata is missing.");

    public static string RepositoryUrl => ReadMetadata("OrbitCordRepositoryUrl")
        ?? throw new InvalidOperationException("OrbitCordRepositoryUrl build metadata is missing.");

    public static string Repository
    {
        get
        {
            if (!Uri.TryCreate(RepositoryUrl, UriKind.Absolute, out var uri))
                throw new InvalidOperationException($"Invalid repository URL: {RepositoryUrl}");

            var repository = uri.AbsolutePath.Trim('/');
            if (repository.EndsWith(".git", StringComparison.OrdinalIgnoreCase))
                repository = repository[..^4];

            if (repository.Count(ch => ch == '/') != 1)
                throw new InvalidOperationException($"Repository URL must identify owner/name: {RepositoryUrl}");

            return repository;
        }
    }

    private static string? ReadMetadata(string key) =>
        Assembly.GetExecutingAssembly()
            .GetCustomAttributes<AssemblyMetadataAttribute>()
            .FirstOrDefault(attribute => string.Equals(attribute.Key, key, StringComparison.Ordinal))
            ?.Value;
}
