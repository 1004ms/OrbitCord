using System.IO;

namespace OrbitCord.App;

public sealed class FileLogger
{
    private readonly object _gate = new();

    public string LogPath { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "OrbitCord",
        "logs",
        "orbitcord.log");

    public void Write(string message)
    {
        try
        {
            lock (_gate)
            {
                Directory.CreateDirectory(Path.GetDirectoryName(LogPath)!);
                File.AppendAllText(LogPath, $"[{DateTimeOffset.Now:O}] {message}{Environment.NewLine}");
            }
        }
        catch
        {
            // Logging must never become a startup/runtime failure source.
        }
    }
}
