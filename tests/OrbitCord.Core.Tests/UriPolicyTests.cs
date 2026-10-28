using OrbitCord.Core;

namespace OrbitCord.Core.Tests;

public sealed class UriPolicyTests
{
    [Theory]
    [InlineData("https://discord.com/app")]
    [InlineData("https://canary.discord.com/channels/@me")]
    [InlineData("https://support.discord.com/hc/en-us")]
    [InlineData("https://discord.gg/example")]
    public void DiscordHttpsUrlsStayInside(string url) => Assert.True(UriPolicy.IsDiscordTopLevel(url));

    [Theory]
    [InlineData("http://discord.com/app")]
    [InlineData("javascript:alert(1)")]
    [InlineData("file:///C:/Windows/System32/calc.exe")]
    [InlineData("https://discord.com.evil.example/")]
    public void UnsafeTopLevelUrlsAreRejected(string url) => Assert.False(UriPolicy.IsDiscordTopLevel(url));
}
