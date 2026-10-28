namespace OrbitCord.App;

internal static class ShortcutBindingPolicy
{
    public static bool IsSafe(IEnumerable<int> rawKeys)
    {
        var keys = rawKeys
            .Select(NativeKeyCode.Normalize)
            .Where(vk => vk > 0)
            .Distinct()
            .ToArray();

        if (keys.Length == 0) return false;

        // A modifier on its own is never a useful global shortcut and can make
        // normal typing behave unpredictably when OrbitCord owns the foreground.
        if (keys.All(IsModifier)) return false;

        if (!keys.Any(IsTypingOrEditingKey)) return true;

        // Shift alone is not enough: Shift+A is still ordinary typing.
        // Ctrl, Alt or Win makes a text-producing key explicit enough to be a
        // deliberate global shortcut rather than something the user types.
        return keys.Any(vk =>
            vk == NativeKeyCode.Control ||
            vk == NativeKeyCode.Alt ||
            vk == NativeKeyCode.LeftWindows ||
            vk == NativeKeyCode.RightWindows);
    }

    private static bool IsModifier(int vk) =>
        vk == NativeKeyCode.Shift ||
        vk == NativeKeyCode.Control ||
        vk == NativeKeyCode.Alt ||
        vk == NativeKeyCode.LeftWindows ||
        vk == NativeKeyCode.RightWindows;

    private static bool IsTypingOrEditingKey(int vk) =>
        vk is >= 0x30 and <= 0x39 || // 0-9
        vk is >= 0x41 and <= 0x5A || // A-Z
        vk is >= 0x60 and <= 0x69 || // numpad digits
        vk is >= 0xBA and <= 0xE2 || // OEM punctuation
        vk is 0x08 or 0x09 or 0x0D or 0x20 || // Backspace, Tab, Enter, Space
        vk is >= 0x21 and <= 0x28 || // Page/Home/End/arrows
        vk is 0x2D or 0x2E; // Insert/Delete
}
