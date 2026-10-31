namespace OrbitCord.App;

internal static class ShortcutBindingPolicy
{
    public static bool IsAllowed(IEnumerable<int> rawKeys)
    {
        var keys = NormalizeKeys(rawKeys);
        if (keys.Length == 0) return false;

        // Modifier-only chords are ambiguous and easy to trigger accidentally.
        // Everything else may be stored and triggered globally, including single
        // letters, numbers, function keys and Shift+key combinations.
        return !keys.All(NativeKeyCode.IsModifier);
    }

    private static int[] NormalizeKeys(IEnumerable<int> rawKeys) =>
        rawKeys
            .Select(NativeKeyCode.Normalize)
            .Where(vk => vk > 0)
            .Distinct()
            .ToArray();
}
