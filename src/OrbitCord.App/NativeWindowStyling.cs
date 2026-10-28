using System.Runtime.InteropServices;
using System.Windows;
using System.Windows.Interop;

namespace OrbitCord.App;

internal static class NativeWindowStyling
{
    private const int DwmwaUseImmersiveDarkMode = 20;
    private const int DwmwaBorderColor = 34;
    private const int DwmwaCaptionColor = 35;
    private const int DwmwaTextColor = 36;

    // OrbitCord palette. COLORREF is 0x00BBGGRR.
    private static readonly int CaptionColor = ColorRef(24, 15, 33);   // #180F21
    private static readonly int BorderColor = ColorRef(54, 30, 70);    // #361E46
    private static readonly int TextColor = ColorRef(244, 235, 255);   // #F4EBFF

    public static void ApplyOrbitCordTitleBar(Window window)
    {
        var hwnd = new WindowInteropHelper(window).Handle;
        if (hwnd == IntPtr.Zero) return;

        var dark = 1;
        TrySet(hwnd, DwmwaUseImmersiveDarkMode, ref dark);
        var captionColor = CaptionColor;
        var textColor = TextColor;
        var borderColor = BorderColor;
        TrySet(hwnd, DwmwaCaptionColor, ref captionColor);
        TrySet(hwnd, DwmwaTextColor, ref textColor);
        TrySet(hwnd, DwmwaBorderColor, ref borderColor);
    }


    public static void ApplyWindowTitle(Window window, string title)
    {
        window.Title = title;
        var hwnd = new WindowInteropHelper(window).Handle;
        if (hwnd == IntPtr.Zero) return;
        try { _ = SetWindowText(hwnd, title); } catch { }
    }

    private static int ColorRef(byte red, byte green, byte blue)
        => red | (green << 8) | (blue << 16);

    private static void TrySet(IntPtr hwnd, int attribute, ref int value)
    {
        try
        {
            _ = DwmSetWindowAttribute(hwnd, attribute, ref value, sizeof(int));
        }
        catch (DllNotFoundException)
        {
            // Older/unsupported Windows builds: keep the system title bar.
        }
        catch (EntryPointNotFoundException)
        {
            // Older/unsupported Windows builds: keep the system title bar.
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern bool SetWindowText(IntPtr hWnd, string lpString);

    [DllImport("dwmapi.dll")]
    private static extern int DwmSetWindowAttribute(
        IntPtr hwnd,
        int dwAttribute,
        ref int pvAttribute,
        int cbAttribute);
}
