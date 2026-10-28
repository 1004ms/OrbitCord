using System.Runtime.InteropServices;
using System.Text;

namespace OrbitCord.App;

internal static class NativeKeyCode
{
    public const int Shift = 0x10;
    public const int Control = 0x11;
    public const int Alt = 0x12;
    public const int LeftWindows = 0x5B;
    public const int RightWindows = 0x5C;

    public static int Normalize(int vk) => vk switch
    {
        0xA0 or 0xA1 => Shift,
        0xA2 or 0xA3 => Control,
        0xA4 or 0xA5 => Alt,
        _ => vk
    };

    public static int SortKey(int vk) => vk switch
    {
        Control => 0,
        Shift => 1,
        Alt => 2,
        LeftWindows or RightWindows => 3,
        _ => 1000 + vk
    };

    public static string FormatChord(IEnumerable<int> keys) =>
        string.Join(" + ", keys.Select(FormatKey));

    public static string FormatKey(int raw)
    {
        var vk = Normalize(raw);
        return vk switch
        {
            Control => "Ctrl",
            Shift => "Shift",
            Alt => "Alt",
            LeftWindows or RightWindows => "Win",
            0x20 => "Space",
            0x1B => "Esc",
            0x09 => "Tab",
            0x0D => "Enter",
            0x08 => "Backspace",
            _ => Win32Name(vk)
        };
    }

    private static string Win32Name(int vk)
    {
        var scan = MapVirtualKey((uint)vk, 0);
        var lParam = (int)(scan << 16);
        var sb = new StringBuilder(64);
        return GetKeyNameText(lParam, sb, sb.Capacity) > 0 ? sb.ToString() : $"VK_{vk:X2}";
    }

    [DllImport("user32.dll")]
    private static extern uint MapVirtualKey(uint uCode, uint uMapType);

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int GetKeyNameText(int lParam, StringBuilder lpString, int nSize);
}
