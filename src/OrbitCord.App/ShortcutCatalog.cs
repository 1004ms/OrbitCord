namespace OrbitCord.App;

public sealed record ShortcutActionInfo(
    ShortcutAction Action,
    string DisplayName,
    string Description,
    bool IsHold,
    string DiscordActionId);

public static class ShortcutCatalog
{
    // OrbitCord Web intentionally exposes only the two voice actions that can be
    // verified against Discord's live MediaEngine state. Legacy enum values stay
    // deserializable so old Shortcuts.json files can be sanitized without losing
    // valid mute/deafen bindings that happen to sit next to removed actions.
    public static readonly IReadOnlyList<ShortcutActionInfo> All =
    [
        new(ShortcutAction.ToggleMute, "Mute microfono", "Alterna lo stato mute del microfono.", false, "TOGGLE_MUTE"),
        new(ShortcutAction.ToggleDeafen, "Deafen", "Alterna lo stato deafen (audio + microfono).", false, "TOGGLE_DEAFEN")
    ];

    public static ShortcutActionInfo Get(ShortcutAction action) =>
        All.FirstOrDefault(x => x.Action == action)
        ?? throw new KeyNotFoundException($"Unknown shortcut action: {action}");

    public static ShortcutActionInfo? FindByDiscordId(string? actionId) =>
        string.IsNullOrWhiteSpace(actionId)
            ? null
            : All.FirstOrDefault(x => string.Equals(x.DiscordActionId, actionId, StringComparison.Ordinal));

    public static List<ShortcutBinding> CreateDefaults() => [];
}
