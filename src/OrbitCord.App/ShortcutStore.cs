using System.IO;
using System.Text.Json;
using System.Text.Json.Serialization;

namespace OrbitCord.App;

public sealed class ShortcutStore
{
    private static readonly JsonSerializerOptions JsonOptions = new()
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    public string FilePath { get; }

    public ShortcutStore(string? filePath = null)
    {
        FilePath = filePath ?? Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OrbitCord",
            "Shortcuts.json");
    }

    public IReadOnlyList<ShortcutBinding> Load()
    {
        try
        {
            if (!File.Exists(FilePath)) return ShortcutCatalog.CreateDefaults();
            var json = File.ReadAllText(FilePath);
            var items = JsonSerializer.Deserialize<List<ShortcutBinding>>(json, JsonOptions) ?? [];
            return Sanitize(items);
        }
        catch
        {
            return ShortcutCatalog.CreateDefaults();
        }
    }

    public void Save(IEnumerable<ShortcutBinding> bindings)
    {
        var clean = Sanitize(bindings).ToList();
        var directory = Path.GetDirectoryName(FilePath);
        if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);
        File.WriteAllText(FilePath, JsonSerializer.Serialize(clean, JsonOptions));
    }

    private static IReadOnlyList<ShortcutBinding> Sanitize(IEnumerable<ShortcutBinding> bindings)
    {
        var result = new List<ShortcutBinding>();
        foreach (var source in bindings)
        {
            var keys = source.VirtualKeys
                .Select(NativeKeyCode.Normalize)
                .Where(x => x > 0)
                .Distinct()
                .OrderBy(NativeKeyCode.SortKey)
                .ToList();

            if (keys.Count == 0) continue;
            if (!ShortcutBindingPolicy.IsSafe(keys)) continue;
            if (!ShortcutCatalog.All.Any(x => x.Action == source.Action)) continue;

            result.Add(new ShortcutBinding
            {
                Id = source.Id == Guid.Empty ? Guid.NewGuid() : source.Id,
                Action = source.Action,
                VirtualKeys = keys,
                Enabled = source.Enabled
            });
        }
        return result;
    }
}
