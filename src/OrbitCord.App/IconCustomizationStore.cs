using System.IO;
using System.Text.Json;
using System.Windows.Media.Imaging;

namespace OrbitCord.App;

public sealed class IconCustomizationStore
{
    public const long MaxCustomIconBytes = 8L * 1024 * 1024;
    public const int MaxCustomAppNameLength = 32;
    public static readonly IReadOnlyList<string> PresetIds = ["purple", "green", "orange", "red", "blue"];

    private static readonly HashSet<string> Presets = new(PresetIds, StringComparer.OrdinalIgnoreCase);
    private readonly string _rootDirectory;
    private readonly string _configPath;
    private readonly string _customIconPath;

    private sealed record AppearanceState(string SelectedIcon, HashSet<string> DeletedIcons, string CustomAppName);

    public IconCustomizationStore()
    {
        _rootDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OrbitCord");
        _configPath = Path.Combine(_rootDirectory, "Appearance.json");
        _customIconPath = Path.Combine(_rootDirectory, "Customization", "custom-icon.png");
    }

    public string CustomIconPath => _customIconPath;

    public string CustomAppName => LoadState().CustomAppName;

    public string DisplayAppName => FormatAppName(CustomAppName);

    public void SaveCustomAppName(string? name)
    {
        var state = LoadState();
        WriteState(state.SelectedIcon, state.DeletedIcons, NormalizeCustomAppName(name));
    }

    public static string FormatAppName(string? customName)
    {
        var normalized = NormalizeCustomAppName(customName);
        return string.IsNullOrWhiteSpace(normalized) ? "OrbitCord" : $"{normalized} (OrbitCord)";
    }

    public IReadOnlyList<string> AvailablePresetIds
    {
        get
        {
            var state = LoadState();
            return PresetIds.Where(id => !state.DeletedIcons.Contains(id)).ToArray();
        }
    }

    public string SelectedIcon
    {
        get
        {
            var state = LoadState();
            if (state.SelectedIcon == "custom" && File.Exists(_customIconPath)) return "custom";
            if (Presets.Contains(state.SelectedIcon) && !state.DeletedIcons.Contains(state.SelectedIcon)) return state.SelectedIcon;
            return FirstAvailableIcon(state.DeletedIcons);
        }
    }

    public string GetSelectedIconPath()
    {
        var selected = SelectedIcon;
        if (selected == "custom") return _customIconPath;
        return GetPresetPath(selected);
    }

    public string GetPresetPath(string preset)
    {
        if (!Presets.Contains(preset)) throw new ArgumentOutOfRangeException(nameof(preset));
        return Path.Combine(AppContext.BaseDirectory, "Assets", "Customization", $"{preset.ToLowerInvariant()}.png");
    }

    public void SavePreset(string preset)
    {
        if (!Presets.Contains(preset)) throw new ArgumentOutOfRangeException(nameof(preset));
        var state = LoadState();
        var normalized = preset.ToLowerInvariant();
        if (state.DeletedIcons.Contains(normalized)) throw new InvalidOperationException("This OrbitCord icon was deleted.");
        WriteState(normalized, state.DeletedIcons, state.CustomAppName);
    }

    public void SelectCustom()
    {
        if (!File.Exists(_customIconPath)) throw new FileNotFoundException("No custom OrbitCord icon has been uploaded.", _customIconPath);
        var state = LoadState();
        WriteState("custom", state.DeletedIcons, state.CustomAppName);
    }

    public void SaveCustomPng(byte[] bytes)
    {
        ValidatePng(bytes);
        var directory = Path.GetDirectoryName(_customIconPath)!;
        Directory.CreateDirectory(directory);
        var temp = _customIconPath + ".tmp";
        File.WriteAllBytes(temp, bytes);
        File.Move(temp, _customIconPath, true);
        var state = LoadState();
        WriteState("custom", state.DeletedIcons, state.CustomAppName);
    }

    public void DeleteIcon(string icon)
    {
        var normalized = icon.Trim().ToLowerInvariant();
        var state = LoadState();
        var deleted = new HashSet<string>(state.DeletedIcons, StringComparer.OrdinalIgnoreCase);
        var presetExists = Presets.Contains(normalized) && !deleted.Contains(normalized);
        var customExists = normalized == "custom" && File.Exists(_customIconPath);
        if (!presetExists && !customExists) return;

        var availableCount = PresetIds.Count(id => !deleted.Contains(id)) + (File.Exists(_customIconPath) ? 1 : 0);
        if (availableCount <= 1) throw new InvalidOperationException("Deve rimanere almeno 1 icona.");

        if (customExists)
        {
            File.Delete(_customIconPath);
        }
        else
        {
            deleted.Add(normalized);
        }

        var selected = state.SelectedIcon;
        if (string.Equals(selected, normalized, StringComparison.OrdinalIgnoreCase) ||
            (selected == "custom" && !File.Exists(_customIconPath)) ||
            (Presets.Contains(selected) && deleted.Contains(selected)))
        {
            selected = FirstAvailableIcon(deleted);
        }
        WriteState(selected, deleted, state.CustomAppName);
    }

    public byte[]? ReadCustomPng() => File.Exists(_customIconPath) ? File.ReadAllBytes(_customIconPath) : null;

    public byte[] ReadPresetPng(string preset) => File.ReadAllBytes(GetPresetPath(preset));

    public static string ToDataUrl(byte[] bytes) => $"data:image/png;base64,{Convert.ToBase64String(bytes)}";

    private string FirstAvailableIcon(HashSet<string> deleted)
    {
        var preset = PresetIds.FirstOrDefault(id => !deleted.Contains(id));
        if (!string.IsNullOrWhiteSpace(preset)) return preset;
        if (File.Exists(_customIconPath)) return "custom";
        // This should only happen with a damaged hand-edited config. Recover to default.
        return "purple";
    }

    private AppearanceState LoadState()
    {
        var deleted = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var selected = "purple";
        var customAppName = "";
        try
        {
            if (!File.Exists(_configPath)) return new AppearanceState(selected, deleted, "");
            using var document = JsonDocument.Parse(File.ReadAllText(_configPath));
            if (document.RootElement.TryGetProperty("selectedIcon", out var value))
            {
                var candidate = value.GetString()?.Trim().ToLowerInvariant();
                if (candidate == "custom" || (candidate is not null && Presets.Contains(candidate))) selected = candidate;
            }
            if (document.RootElement.TryGetProperty("customAppName", out var appNameValue))
            {
                customAppName = NormalizeCustomAppName(appNameValue.GetString());
            }
            if (document.RootElement.TryGetProperty("deletedIcons", out var deletedValue) && deletedValue.ValueKind == JsonValueKind.Array)
            {
                foreach (var item in deletedValue.EnumerateArray())
                {
                    var id = item.GetString()?.Trim().ToLowerInvariant();
                    if (id is not null && Presets.Contains(id)) deleted.Add(id);
                }
            }
        }
        catch
        {
            // A damaged preference file should never prevent OrbitCord from starting.
        }

        // Never allow a malformed config to hide all bundled presets if no custom icon exists.
        if (deleted.Count >= PresetIds.Count && !File.Exists(_customIconPath)) deleted.Clear();
        return new AppearanceState(selected, deleted, customAppName);
    }

    private void WriteState(string selected, HashSet<string> deleted, string customAppName)
    {
        Directory.CreateDirectory(_rootDirectory);
        var temp = _configPath + ".tmp";
        var json = JsonSerializer.Serialize(new
        {
            selectedIcon = selected,
            deletedIcons = deleted.OrderBy(x => x).ToArray(),
            customAppName = NormalizeCustomAppName(customAppName)
        }, new JsonSerializerOptions { WriteIndented = true });
        File.WriteAllText(temp, json);
        File.Move(temp, _configPath, true);
    }

    private static string NormalizeCustomAppName(string? name)
    {
        var normalized = string.Join(" ", (name ?? "").Split([' ', '\t', '\r', '\n'], StringSplitOptions.RemoveEmptyEntries));
        const string suffix = "(OrbitCord)";
        if (normalized.EndsWith(suffix, StringComparison.OrdinalIgnoreCase))
            normalized = normalized[..^suffix.Length].TrimEnd();
        if (normalized.Equals("OrbitCord", StringComparison.OrdinalIgnoreCase))
            normalized = "";
        if (normalized.Length > MaxCustomAppNameLength)
            normalized = normalized[..MaxCustomAppNameLength].TrimEnd();
        return normalized;
    }

    private static void ValidatePng(byte[] bytes)
    {
        if (bytes.Length == 0 || bytes.LongLength > MaxCustomIconBytes)
            throw new InvalidDataException("PNG size is invalid.");

        ReadOnlySpan<byte> signature = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];
        if (bytes.Length < signature.Length || !bytes.AsSpan(0, signature.Length).SequenceEqual(signature))
            throw new InvalidDataException("The selected file is not a PNG.");

        using var stream = new MemoryStream(bytes, writable: false);
        var decoder = BitmapDecoder.Create(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
        var frame = decoder.Frames.FirstOrDefault() ?? throw new InvalidDataException("The PNG has no image frame.");
        if (frame.PixelWidth < 1 || frame.PixelHeight < 1 || frame.PixelWidth > 4096 || frame.PixelHeight > 4096)
            throw new InvalidDataException("PNG dimensions must be between 1 and 4096 pixels.");
    }
}
