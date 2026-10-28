namespace OrbitCord.Core;

public static class UriPolicy
{
    public static bool IsDiscordTopLevel(string? raw)
    {
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri) ||
            !string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        var host = uri.DnsSafeHost;
        return string.Equals(host, "discord.com", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(".discord.com", StringComparison.OrdinalIgnoreCase) ||
               string.Equals(host, "discord.gg", StringComparison.OrdinalIgnoreCase) ||
               host.EndsWith(".discord.gg", StringComparison.OrdinalIgnoreCase);
    }

    public static bool IsSafeExternal(string? raw)
    {
        if (!Uri.TryCreate(raw, UriKind.Absolute, out var uri)) return false;
        return string.Equals(uri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ||
               string.Equals(uri.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase);
    }
}
