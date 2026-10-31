using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OrbitCord.Installer;

internal sealed class GitHubReleaseClient : IDisposable
{
    private readonly HttpClient _httpClient;

    public GitHubReleaseClient()
    {
        var handler = new HttpClientHandler
        {
            AutomaticDecompression = DecompressionMethods.All
        };
        _httpClient = new HttpClient(handler);
        _httpClient.DefaultRequestHeaders.UserAgent.Add(new ProductInfoHeaderValue("OrbitCord-Setup", InstallerBuildInfo.Version));
        _httpClient.DefaultRequestHeaders.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        _httpClient.DefaultRequestHeaders.Add("X-GitHub-Api-Version", "2022-11-28");
    }

    public Task<ReleaseDescriptor> GetLatestReleaseAsync(CancellationToken cancellationToken)
    {
        var uri = $"https://api.github.com/repos/{InstallerBuildInfo.Repository}/releases/latest";
        return GetReleaseAsync(uri, "latest", cancellationToken);
    }

    public Task<ReleaseDescriptor> GetExactReleaseAsync(string version, CancellationToken cancellationToken)
    {
        var tag = version.StartsWith('v') ? version : $"v{version}";
        var uri = $"https://api.github.com/repos/{InstallerBuildInfo.Repository}/releases/tags/{Uri.EscapeDataString(tag)}";
        return GetReleaseAsync(uri, tag, cancellationToken);
    }

    private async Task<ReleaseDescriptor> GetReleaseAsync(
        string uri,
        string fallbackTag,
        CancellationToken cancellationToken)
    {
        using var response = await _httpClient.GetAsync(uri, cancellationToken).ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        await using var stream = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        var dto = await JsonSerializer.DeserializeAsync<ReleaseDto>(stream, cancellationToken: cancellationToken).ConfigureAwait(false)
                  ?? throw new InvalidOperationException("GitHub returned an empty release response.");

        var assets = dto.Assets
            .Where(asset => !string.IsNullOrWhiteSpace(asset.Name) && !string.IsNullOrWhiteSpace(asset.BrowserDownloadUrl))
            .ToDictionary(
                asset => asset.Name!,
                asset => new ReleaseAsset(asset.Name!, new Uri(asset.BrowserDownloadUrl!, UriKind.Absolute)),
                StringComparer.OrdinalIgnoreCase);

        return new ReleaseDescriptor(dto.TagName ?? fallbackTag, assets);
    }

    public async Task DownloadFileAsync(
        Uri source,
        string destination,
        string status,
        double progressStart,
        double progressSpan,
        IProgress<InstallerProgress>? progress,
        CancellationToken cancellationToken)
    {
        using var response = await _httpClient.GetAsync(source, HttpCompletionOption.ResponseHeadersRead, cancellationToken)
            .ConfigureAwait(false);
        response.EnsureSuccessStatusCode();

        var total = response.Content.Headers.ContentLength;
        await using var input = await response.Content.ReadAsStreamAsync(cancellationToken).ConfigureAwait(false);
        await using var output = new FileStream(destination, FileMode.Create, FileAccess.Write, FileShare.None, 81920, true);

        var buffer = new byte[81920];
        long written = 0;
        while (true)
        {
            var read = await input.ReadAsync(buffer, cancellationToken).ConfigureAwait(false);
            if (read == 0) break;
            await output.WriteAsync(buffer.AsMemory(0, read), cancellationToken).ConfigureAwait(false);
            written += read;

            if (total is > 0)
            {
                var fraction = Math.Clamp((double)written / total.Value, 0d, 1d);
                progress?.Report(new InstallerProgress(status, progressStart + progressSpan * fraction));
            }
        }
    }

    public void Dispose() => _httpClient.Dispose();

    private sealed class ReleaseDto
    {
        [JsonPropertyName("tag_name")]
        public string? TagName { get; init; }

        [JsonPropertyName("assets")]
        public List<ReleaseAssetDto> Assets { get; init; } = [];
    }

    private sealed class ReleaseAssetDto
    {
        [JsonPropertyName("name")]
        public string? Name { get; init; }

        [JsonPropertyName("browser_download_url")]
        public string? BrowserDownloadUrl { get; init; }
    }
}
