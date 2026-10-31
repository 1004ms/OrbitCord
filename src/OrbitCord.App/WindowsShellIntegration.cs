using System.ComponentModel;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Windows;
using System.Windows.Interop;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace OrbitCord.App;

internal static class WindowsShellIntegration
{
    private const string AppUserModelId = "OrbitCord.Desktop";

    private const uint ShcneRenameItem = 0x00000001;
    private const uint ShcneUpdateDir = 0x00001000;
    private const uint ShcneUpdateItem = 0x00002000;
    private const uint ShcnfPathW = 0x0005;
    private const uint GpsReadWrite = 0x00000002;

    private const uint WmSetIcon = 0x0080;
    private const int IconSmall = 0;
    private const int IconBig = 1;
    private const uint ImageIcon = 1;
    private const uint LrLoadFromFile = 0x00000010;

    private static readonly Guid AppUserModelPropertySet = new("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3");
    private static readonly PropertyKey PkeyAppUserModelRelaunchCommand = new(AppUserModelPropertySet, 2);
    private static readonly PropertyKey PkeyAppUserModelRelaunchIconResource = new(AppUserModelPropertySet, 3);
    private static readonly PropertyKey PkeyAppUserModelRelaunchDisplayNameResource = new(AppUserModelPropertySet, 4);
    private static readonly PropertyKey PkeyAppUserModelId = new(AppUserModelPropertySet, 5);

    private static readonly int[] ShellIconSizes = [16, 24, 32, 48, 64, 128, 256];
    private static readonly object WindowIconGate = new();
    private static readonly Dictionary<IntPtr, WindowIconHandles> WindowIcons = [];

    private sealed record WindowIconHandles(IntPtr Big, IntPtr Small);

    [StructLayout(LayoutKind.Sequential)]
    private struct PropertyKey
    {
        public Guid FormatId;
        public uint PropertyId;

        public PropertyKey(Guid formatId, uint propertyId)
        {
            FormatId = formatId;
            PropertyId = propertyId;
        }
    }

    [StructLayout(LayoutKind.Explicit)]
    private struct PropVariant
    {
        [FieldOffset(0)] public ushort VariantType;
        [FieldOffset(8)] public IntPtr PointerValue;

        public static PropVariant FromString(string value) => new()
        {
            VariantType = (ushort)VarEnum.VT_LPWSTR,
            PointerValue = Marshal.StringToCoTaskMemUni(value)
        };
    }

    [ComImport]
    [Guid("886D8EEB-8CF2-4446-8D02-CDBA1DBDCF99")]
    [InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
    private interface IPropertyStore
    {
        [PreserveSig] int GetCount(out uint propertyCount);
        [PreserveSig] int GetAt(uint propertyIndex, out PropertyKey key);
        [PreserveSig] int GetValue(ref PropertyKey key, out PropVariant value);
        [PreserveSig] int SetValue(ref PropertyKey key, ref PropVariant value);
        [PreserveSig] int Commit();
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern int SetCurrentProcessExplicitAppUserModelID(string appID);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    private static extern void SHChangeNotify(uint wEventId, uint uFlags, string? dwItem1, string? dwItem2);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, PreserveSig = false)]
    private static extern void SHGetPropertyStoreFromParsingName(
        string pszPath,
        IntPtr pbc,
        uint flags,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IPropertyStore propertyStore);

    [DllImport("shell32.dll", PreserveSig = true)]
    private static extern int SHGetPropertyStoreForWindow(
        IntPtr hwnd,
        ref Guid riid,
        [MarshalAs(UnmanagedType.Interface)] out IPropertyStore propertyStore);

    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PropVariant propVariant);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    private static extern IntPtr LoadImage(
        IntPtr hInst,
        string name,
        uint type,
        int cx,
        int cy,
        uint fuLoad);

    [DllImport("user32.dll", SetLastError = true)]
    private static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    private static extern bool DestroyIcon(IntPtr hIcon);

    public static void InitializeProcessIdentity()
    {
        try
        {
            _ = SetCurrentProcessExplicitAppUserModelID(AppUserModelId);
        }
        catch
        {
            // Windows Shell integration is best effort; startup must never depend on it.
        }
    }

    /// <summary>
    /// Applies the live window/taskbar identity. This is intentionally separate from shortcut
    /// synchronisation: a running window must not depend on Explorer re-reading a .lnk file.
    /// </summary>
    public static void ApplyWindowAppearance(Window window, string displayName, string pngIconPath, FileLogger? logger)
    {
        try
        {
            var executablePath = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(executablePath) || !File.Exists(executablePath)) return;
            if (string.IsNullOrWhiteSpace(pngIconPath) || !File.Exists(pngIconPath)) return;

            var hwnd = new WindowInteropHelper(window).Handle;
            if (hwnd == IntPtr.Zero) return;

            var iconPath = MaterializeShellIcon(pngIconPath);
            ApplyNativeWindowIcon(hwnd, iconPath);
            ApplyWindowPropertyStore(hwnd, executablePath, displayName, iconPath);

            logger?.Write($"Windows live taskbar appearance synchronized as '{displayName}'.");
        }
        catch (Exception ex)
        {
            // Keep the last known-good taskbar/window icon rather than clearing it on failure.
            logger?.Write($"Windows live taskbar appearance synchronization failed: {ex.Message}");
        }
    }

    public static void SyncAppearance(string displayName, string pngIconPath, FileLogger? logger)
    {
        try
        {
            var executablePath = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(executablePath) || !File.Exists(executablePath)) return;
            if (string.IsNullOrWhiteSpace(pngIconPath) || !File.Exists(pngIconPath)) return;

            // Materialize and validate before touching any shortcut. If icon generation fails,
            // existing shortcuts keep their previous valid IconLocation instead of becoming blank.
            var iconPath = MaterializeShellIcon(pngIconPath);
            var desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
            var startMenu = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Microsoft", "Windows", "Start Menu", "Programs");
            var pinnedTaskbar = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData),
                "Microsoft", "Internet Explorer", "Quick Launch", "User Pinned", "TaskBar");

            var shellType = Type.GetTypeFromProgID("WScript.Shell");
            if (shellType is null) return;

            object? shellObject = null;
            try
            {
                shellObject = Activator.CreateInstance(shellType);
                if (shellObject is null) return;
                dynamic shell = shellObject;

                SyncShortcutFolder(shell, desktop, executablePath, displayName, iconPath, renameShortcut: true);
                SyncShortcutFolder(shell, startMenu, executablePath, displayName, iconPath, renameShortcut: true);
                SyncShortcutFolder(shell, pinnedTaskbar, executablePath, displayName, iconPath, renameShortcut: false);
            }
            finally
            {
                ReleaseComObject(shellObject);
            }

            logger?.Write($"Windows shell shortcut appearance synchronized as '{displayName}'.");
        }
        catch (Exception ex)
        {
            logger?.Write($"Windows shell shortcut appearance synchronization failed: {ex.Message}");
        }
    }

    private static void SyncShortcutFolder(
        dynamic shell,
        string folder,
        string executablePath,
        string displayName,
        string iconPath,
        bool renameShortcut)
    {
        if (string.IsNullOrWhiteSpace(folder) || !Directory.Exists(folder)) return;

        var touched = false;
        foreach (var shortcutPath in Directory.EnumerateFiles(folder, "*.lnk", SearchOption.TopDirectoryOnly).ToArray())
        {
            if (!ShortcutTargetsExecutable(shell, shortcutPath, executablePath)) continue;

            if (!UpdateShortcut(shell, shortcutPath, displayName, iconPath)) continue;
            touched = true;
            ApplyShortcutAppId(shortcutPath);
            NotifyShortcutUpdated(shortcutPath);

            if (!renameShortcut) continue;

            var desiredPath = Path.Combine(folder, SanitizeShortcutFileName(displayName) + ".lnk");
            var finalShortcutPath = CreateRenamedShortcut(
                shell,
                shortcutPath,
                desiredPath,
                executablePath,
                displayName,
                iconPath);

            ApplyShortcutAppId(finalShortcutPath);
            NotifyShortcutUpdated(finalShortcutPath);
        }

        if (touched)
            NotifyShortcutDirectoryUpdated(folder);
    }

    private static bool UpdateShortcut(dynamic shell, string shortcutPath, string displayName, string iconPath)
    {
        object? shortcutObject = null;
        try
        {
            shortcutObject = shell.CreateShortcut(shortcutPath);
            dynamic shortcut = shortcutObject;
            shortcut.IconLocation = $"{iconPath},0";
            shortcut.Description = displayName;
            shortcut.Save();
            return true;
        }
        catch
        {
            // One stale/locked shortcut must not prevent the others from refreshing.
            return false;
        }
        finally
        {
            ReleaseComObject(shortcutObject);
        }
    }

    /// <summary>
    /// Creates and verifies the renamed shortcut before removing the old path. There is never a
    /// point where the rename operation intentionally leaves the user with no valid shortcut.
    /// </summary>
    private static string CreateRenamedShortcut(
        dynamic shell,
        string shortcutPath,
        string desiredPath,
        string executablePath,
        string displayName,
        string iconPath)
    {
        if (PathsEqual(shortcutPath, desiredPath)) return shortcutPath;

        // A destination owned by another application/name is never overwritten.
        if (File.Exists(desiredPath))
        {
            if (!ShortcutTargetsExecutable(shell, desiredPath, executablePath))
                return shortcutPath;

            if (!UpdateShortcut(shell, desiredPath, displayName, iconPath))
                return shortcutPath;

            ApplyShortcutAppId(desiredPath);
            if (!ShortcutTargetsExecutable(shell, desiredPath, executablePath))
                return shortcutPath;

            if (TryDeleteOldShortcut(shortcutPath, desiredPath))
                NotifyShortcutRenamed(shortcutPath, desiredPath);
            return desiredPath;
        }

        object? sourceObject = null;
        object? destinationObject = null;
        var created = false;
        try
        {
            sourceObject = shell.CreateShortcut(shortcutPath);
            dynamic source = sourceObject;

            destinationObject = shell.CreateShortcut(desiredPath);
            dynamic destination = destinationObject;
            destination.TargetPath = (string?)source.TargetPath ?? executablePath;
            destination.Arguments = (string?)source.Arguments ?? string.Empty;
            destination.WorkingDirectory = (string?)source.WorkingDirectory ?? Path.GetDirectoryName(executablePath) ?? string.Empty;
            destination.Hotkey = (string?)source.Hotkey ?? string.Empty;
            destination.WindowStyle = (int)source.WindowStyle;
            destination.Description = displayName;
            destination.IconLocation = $"{iconPath},0";
            destination.Save();
            created = true;
        }
        catch
        {
            if (created || File.Exists(desiredPath))
            {
                try { File.Delete(desiredPath); } catch { }
            }
            return shortcutPath;
        }
        finally
        {
            ReleaseComObject(destinationObject);
            ReleaseComObject(sourceObject);
        }

        ApplyShortcutAppId(desiredPath);
        if (!File.Exists(desiredPath) || !ShortcutTargetsExecutable(shell, desiredPath, executablePath))
        {
            try { File.Delete(desiredPath); } catch { }
            return shortcutPath;
        }

        if (TryDeleteOldShortcut(shortcutPath, desiredPath))
            NotifyShortcutRenamed(shortcutPath, desiredPath);
        return desiredPath;
    }

    private static bool TryDeleteOldShortcut(string shortcutPath, string desiredPath)
    {
        if (PathsEqual(shortcutPath, desiredPath)) return false;
        try
        {
            if (!File.Exists(shortcutPath)) return true;
            File.Delete(shortcutPath);
            return !File.Exists(shortcutPath);
        }
        catch
        {
            // Keep both valid links rather than risking the new verified link.
            return false;
        }
    }

    private static void NotifyShortcutUpdated(string shortcutPath)
    {
        try
        {
            if (File.Exists(shortcutPath))
                SHChangeNotify(ShcneUpdateItem, ShcnfPathW, shortcutPath, null);
        }
        catch { }
    }

    private static void NotifyShortcutRenamed(string oldPath, string newPath)
    {
        try
        {
            SHChangeNotify(ShcneRenameItem, ShcnfPathW, oldPath, newPath);
        }
        catch { }
    }

    private static void NotifyShortcutDirectoryUpdated(string folder)
    {
        try
        {
            if (Directory.Exists(folder))
                SHChangeNotify(ShcneUpdateDir, ShcnfPathW, folder, null);
        }
        catch { }
    }

    private static void ApplyShortcutAppId(string shortcutPath)
    {
        if (!File.Exists(shortcutPath)) return;

        IPropertyStore? store = null;
        try
        {
            var iid = typeof(IPropertyStore).GUID;
            SHGetPropertyStoreFromParsingName(
                shortcutPath,
                IntPtr.Zero,
                GpsReadWrite,
                ref iid,
                out store);

            SetStringProperty(store, PkeyAppUserModelId, AppUserModelId);
            var result = store.Commit();
            if (result < 0) Marshal.ThrowExceptionForHR(result);
        }
        catch
        {
            // The shortcut still has the correct target/icon even if property stamping fails.
        }
        finally
        {
            ReleaseComObject(store);
        }
    }

    private static void ApplyWindowPropertyStore(IntPtr hwnd, string executablePath, string displayName, string iconPath)
    {
        IPropertyStore? store = null;
        try
        {
            var iid = typeof(IPropertyStore).GUID;
            var hr = SHGetPropertyStoreForWindow(hwnd, ref iid, out store);
            if (hr < 0) Marshal.ThrowExceptionForHR(hr);

            // Microsoft requires relaunch command + display name together. The icon is supplied
            // explicitly so the taskbar/pin never falls back to the EXE's bundled icon.
            SetStringProperty(store, PkeyAppUserModelRelaunchCommand, QuoteCommand(executablePath));
            SetStringProperty(store, PkeyAppUserModelRelaunchDisplayNameResource, displayName);
            SetStringProperty(store, PkeyAppUserModelRelaunchIconResource, $"{iconPath},0");

            // Set the ID last: Windows refreshes taskbar information when this property is set.
            SetStringProperty(store, PkeyAppUserModelId, AppUserModelId);
            var commit = store.Commit();
            if (commit < 0) Marshal.ThrowExceptionForHR(commit);
        }
        finally
        {
            ReleaseComObject(store);
        }
    }

    private static void SetStringProperty(IPropertyStore store, PropertyKey propertyKey, string text)
    {
        var value = PropVariant.FromString(text);
        try
        {
            var key = propertyKey;
            var result = store.SetValue(ref key, ref value);
            if (result < 0) Marshal.ThrowExceptionForHR(result);
        }
        finally
        {
            if (value.PointerValue != IntPtr.Zero)
                _ = PropVariantClear(ref value);
        }
    }

    private static string QuoteCommand(string executablePath)
        => executablePath.Contains(' ') ? $"\"{executablePath}\"" : executablePath;

    private static void ApplyNativeWindowIcon(IntPtr hwnd, string iconPath)
    {
        var big = LoadImage(IntPtr.Zero, iconPath, ImageIcon, 256, 256, LrLoadFromFile);
        var small = LoadImage(IntPtr.Zero, iconPath, ImageIcon, 32, 32, LrLoadFromFile);
        if (big == IntPtr.Zero || small == IntPtr.Zero)
        {
            if (big != IntPtr.Zero) _ = DestroyIcon(big);
            if (small != IntPtr.Zero) _ = DestroyIcon(small);
            throw new Win32Exception(Marshal.GetLastWin32Error(), "Windows could not load the generated OrbitCord icon.");
        }

        _ = SendMessage(hwnd, WmSetIcon, new IntPtr(IconBig), big);
        _ = SendMessage(hwnd, WmSetIcon, new IntPtr(IconSmall), small);

        lock (WindowIconGate)
        {
            if (WindowIcons.Remove(hwnd, out var previous))
            {
                if (previous.Big != IntPtr.Zero) _ = DestroyIcon(previous.Big);
                if (previous.Small != IntPtr.Zero) _ = DestroyIcon(previous.Small);
            }
            WindowIcons[hwnd] = new WindowIconHandles(big, small);
        }
    }

    private static bool ShortcutTargetsExecutable(dynamic shell, string shortcutPath, string executablePath)
    {
        object? shortcutObject = null;
        try
        {
            shortcutObject = shell.CreateShortcut(shortcutPath);
            dynamic shortcut = shortcutObject;
            return PathsEqual(NormalizePath((string?)shortcut.TargetPath), executablePath);
        }
        catch
        {
            return false;
        }
        finally
        {
            ReleaseComObject(shortcutObject);
        }
    }

    private static string MaterializeShellIcon(string pngIconPath)
    {
        var sourcePngBytes = File.ReadAllBytes(pngIconPath);
        var hashInput = sourcePngBytes.Concat("orbitcord-shell-icon-v3"u8.ToArray()).ToArray();
        var hash = Convert.ToHexString(SHA256.HashData(hashInput)).Substring(0, 16).ToLowerInvariant();
        var iconDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OrbitCord", "Customization", "ShellIcons");
        Directory.CreateDirectory(iconDirectory);
        var iconPath = Path.Combine(iconDirectory, $"shell-v3-{hash}.ico");

        if (File.Exists(iconPath) && ValidateShellIcon(iconPath))
            return iconPath;

        var tempPath = iconPath + "." + Guid.NewGuid().ToString("N") + ".tmp";
        try
        {
            var frames = ShellIconSizes
                .Select(size => (Size: size, Bytes: EncodeSquarePngFrame(sourcePngBytes, size)))
                .ToArray();

            WriteIconContainer(tempPath, frames);
            if (!ValidateShellIcon(tempPath))
                throw new InvalidDataException("Generated OrbitCord shell icon failed validation.");

            File.Move(tempPath, iconPath, true);
        }
        finally
        {
            try
            {
                if (File.Exists(tempPath)) File.Delete(tempPath);
            }
            catch { }
        }

        // Old generations are intentionally left alone for a while because an existing pinned
        // shortcut can still reference them until Windows refreshes its taskbar cache.
        CleanupOldShellIcons(iconDirectory, iconPath);
        return iconPath;
    }

    private static byte[] EncodeSquarePngFrame(byte[] sourcePngBytes, int size)
    {
        using var input = new MemoryStream(sourcePngBytes, writable: false);
        var decoder = BitmapDecoder.Create(input, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
        var source = decoder.Frames.FirstOrDefault()
                     ?? throw new InvalidDataException("Selected icon has no image frame.");

        var scale = Math.Min((double)size / source.PixelWidth, (double)size / source.PixelHeight);
        var drawWidth = Math.Max(1d, source.PixelWidth * scale);
        var drawHeight = Math.Max(1d, source.PixelHeight * scale);
        var left = (size - drawWidth) / 2d;
        var top = (size - drawHeight) / 2d;

        var visual = new DrawingVisual();
        using (var context = visual.RenderOpen())
        {
            context.DrawRectangle(Brushes.Transparent, null, new Rect(0, 0, size, size));
            context.DrawImage(source, new Rect(left, top, drawWidth, drawHeight));
        }

        var rendered = new RenderTargetBitmap(size, size, 96, 96, PixelFormats.Pbgra32);
        rendered.Render(visual);
        rendered.Freeze();

        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(rendered));
        using var output = new MemoryStream();
        encoder.Save(output);
        return output.ToArray();
    }

    private static void WriteIconContainer(string path, IReadOnlyList<(int Size, byte[] Bytes)> frames)
    {
        var offset = 6 + (16 * frames.Count);
        using var stream = new FileStream(path, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
        using var writer = new BinaryWriter(stream);

        writer.Write((ushort)0); // ICONDIR.reserved
        writer.Write((ushort)1); // ICONDIR.type = icon
        writer.Write((ushort)frames.Count);

        foreach (var frame in frames)
        {
            writer.Write((byte)(frame.Size >= 256 ? 0 : frame.Size));
            writer.Write((byte)(frame.Size >= 256 ? 0 : frame.Size));
            writer.Write((byte)0);    // palette size
            writer.Write((byte)0);    // reserved
            writer.Write((ushort)1);  // planes
            writer.Write((ushort)32); // bits per pixel
            writer.Write((uint)frame.Bytes.Length);
            writer.Write((uint)offset);
            offset += frame.Bytes.Length;
        }

        foreach (var frame in frames)
            writer.Write(frame.Bytes);

        writer.Flush();
        stream.Flush(flushToDisk: true);
    }

    private static bool ValidateShellIcon(string iconPath)
    {
        try
        {
            using var stream = new FileStream(iconPath, FileMode.Open, FileAccess.Read, FileShare.ReadWrite);
            var decoder = new IconBitmapDecoder(stream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
            if (decoder.Frames.Count < ShellIconSizes.Length) return false;

            var sizes = decoder.Frames.Select(frame => frame.PixelWidth).ToHashSet();
            return ShellIconSizes.All(sizes.Contains) && decoder.Frames.All(frame => frame.PixelWidth == frame.PixelHeight);
        }
        catch
        {
            return false;
        }
    }

    private static void CleanupOldShellIcons(string iconDirectory, string currentIconPath)
    {
        foreach (var stale in Directory.EnumerateFiles(iconDirectory, "shell-*.ico", SearchOption.TopDirectoryOnly))
        {
            if (PathsEqual(stale, currentIconPath)) continue;
            try
            {
                // Keep old icon resources for 90 days so a cached/pinned shortcut never points at
                // a file OrbitCord has just removed.
                if (File.GetLastWriteTimeUtc(stale) < DateTime.UtcNow.AddDays(-90))
                    File.Delete(stale);
            }
            catch { }
        }
    }

    private static string SanitizeShortcutFileName(string displayName)
    {
        var invalid = Path.GetInvalidFileNameChars().ToHashSet();
        var sanitized = new string(displayName.Select(ch => invalid.Contains(ch) ? '_' : ch).ToArray()).Trim();
        return string.IsNullOrWhiteSpace(sanitized) ? "OrbitCord" : sanitized;
    }

    private static string NormalizePath(string? path)
    {
        if (string.IsNullOrWhiteSpace(path)) return string.Empty;
        try
        {
            return Path.GetFullPath(Environment.ExpandEnvironmentVariables(path.Trim().Trim('"')));
        }
        catch
        {
            return path.Trim().Trim('"');
        }
    }

    private static bool PathsEqual(string? left, string? right)
        => string.Equals(NormalizePath(left), NormalizePath(right), StringComparison.OrdinalIgnoreCase);

    private static void ReleaseComObject(object? value)
    {
        if (value is null) return;
        try
        {
            if (Marshal.IsComObject(value)) Marshal.FinalReleaseComObject(value);
        }
        catch
        {
            // Best effort COM cleanup.
        }
    }
}
