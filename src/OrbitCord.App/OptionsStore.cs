using System.IO;
using System.Text.Json;

namespace OrbitCord.App;

public sealed record OrbitCordOptions(bool DisableSelfStreamPreview);

public sealed class OptionsStore
{
    private readonly string _rootDirectory;
    private readonly string _configPath;

    public OptionsStore()
    {
        _rootDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OrbitCord");
        _configPath = Path.Combine(_rootDirectory, "Options.json");
    }

    public OrbitCordOptions Load()
    {
        try
        {
            if (!File.Exists(_configPath)) return new OrbitCordOptions(false);
            using var document = JsonDocument.Parse(File.ReadAllText(_configPath));
            var root = document.RootElement;
            var disableSelfStreamPreview = root.TryGetProperty("disableSelfStreamPreview", out var value)
                && value.ValueKind is JsonValueKind.True or JsonValueKind.False
                && value.GetBoolean();
            return new OrbitCordOptions(disableSelfStreamPreview);
        }
        catch
        {
            return new OrbitCordOptions(false);
        }
    }

    public void Save(OrbitCordOptions options)
    {
        Directory.CreateDirectory(_rootDirectory);
        var temp = _configPath + ".tmp";
        var json = JsonSerializer.Serialize(new
        {
            disableSelfStreamPreview = options.DisableSelfStreamPreview
        }, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(temp, json);
        File.Move(temp, _configPath, true);
    }
}
