using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace OrbitCord.App;

internal static class WindowsShellIntegration
{
    private const string AppUserModelId = "OrbitCord.Desktop";
    private const uint ShcneRenameItem = 0x00000001;
    private const uint ShcneUpdateItem = 0x00002000;
    private const uint ShcnfPathW = 0x0005;
    private const uint GpsReadWrite = 0x00000002;
    private static readonly PropertyKey PkeyAppUserModelId = new(
        new Guid("9F4C2855-9F79-4B39-A8D0-E1D42DE1D5F3"),
        5);

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

    [DllImport("ole32.dll")]
    private static extern int PropVariantClear(ref PropVariant propVariant);

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

    public static void SyncAppearance(string displayName, string pngIconPath, FileLogger? logger)
    {
        try
        {
            var executablePath = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(executablePath) || !File.Exists(executablePath)) return;
            if (string.IsNullOrWhiteSpace(pngIconPath) || !File.Exists(pngIconPath)) return;

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

            logger?.Write($"Windows shell appearance synchronized as '{displayName}'.");
        }
        catch (Exception ex)
        {
            logger?.Write($"Windows shell appearance synchronization failed: {ex.Message}");
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

        foreach (var shortcutPath in Directory.EnumerateFiles(folder, "*.lnk", SearchOption.TopDirectoryOnly).ToArray())
        {
            var matched = false;
            object? shortcutObject = null;
            try
            {
                shortcutObject = shell.CreateShortcut(shortcutPath);
                dynamic shortcut = shortcutObject;
                var targetPath = NormalizePath((string?)shortcut.TargetPath);
                if (!PathsEqual(targetPath, executablePath)) continue;

                shortcut.IconLocation = $"{iconPath},0";
                shortcut.Description = displayName;
                shortcut.Save();
                matched = true;
                NotifyShortcutUpdated(shortcutPath);
            }
            catch
            {
                // One stale or locked shortcut must not prevent the others from refreshing.
            }
            finally
            {
                ReleaseComObject(shortcutObject);
            }

            if (!matched) continue;
            var finalShortcutPath = shortcutPath;

            if (renameShortcut)
            {
                var desiredPath = Path.Combine(folder, SanitizeShortcutFileName(displayName) + ".lnk");
                finalShortcutPath = TryRenameShortcut(shell, shortcutPath, desiredPath, executablePath);
            }

            ApplyShortcutAppId(finalShortcutPath);
            NotifyShortcutUpdated(finalShortcutPath);
        }
    }

    private static string TryRenameShortcut(dynamic shell, string shortcutPath, string desiredPath, string executablePath)
    {
        if (PathsEqual(shortcutPath, desiredPath)) return shortcutPath;

        try
        {
            if (File.Exists(desiredPath))
            {
                if (!ShortcutTargetsExecutable(shell, desiredPath, executablePath))
                    return shortcutPath;

                File.Delete(desiredPath);
            }

            File.Move(shortcutPath, desiredPath);

            if (!File.Exists(desiredPath) || !ShortcutTargetsExecutable(shell, desiredPath, executablePath))
            {
                try
                {
                    if (File.Exists(desiredPath) && !File.Exists(shortcutPath))
                        File.Move(desiredPath, shortcutPath);
                }
                catch { }

                return shortcutPath;
            }

            NotifyShortcutRenamed(shortcutPath, desiredPath);
            return desiredPath;
        }
        catch
        {
            return File.Exists(shortcutPath) ? shortcutPath : desiredPath;
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

    private static void ApplyShortcutAppId(string shortcutPath)
    {
        if (!File.Exists(shortcutPath)) return;

        IPropertyStore? store = null;
        var value = default(PropVariant);
        try
        {
            var iid = typeof(IPropertyStore).GUID;
            SHGetPropertyStoreFromParsingName(
                shortcutPath,
                IntPtr.Zero,
                GpsReadWrite,
                ref iid,
                out store);

            var key = PkeyAppUserModelId;
            value = PropVariant.FromString(AppUserModelId);
            if (store.SetValue(ref key, ref value) >= 0)
                _ = store.Commit();
        }
        catch
        {
            // The shortcut still has the correct target/icon even if property stamping fails.
        }
        finally
        {
            if (value.PointerValue != IntPtr.Zero)
                _ = PropVariantClear(ref value);
            ReleaseComObject(store);
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
        var normalized = NormalizePngForShell(sourcePngBytes);

        var hash = Convert.ToHexString(SHA256.HashData(sourcePngBytes)).Substring(0, 16).ToLowerInvariant();
        var iconDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OrbitCord", "Customization", "ShellIcons");
        Directory.CreateDirectory(iconDirectory);
        var iconPath = Path.Combine(iconDirectory, $"shell-v2-{hash}.ico");

        if (!File.Exists(iconPath))
        {
            using var stream = new FileStream(iconPath, FileMode.CreateNew, FileAccess.Write, FileShare.Read);
            using var writer = new BinaryWriter(stream);
            writer.Write((ushort)0); // ICONDIR.reserved
            writer.Write((ushort)1); // ICONDIR.type = icon
            writer.Write((ushort)1); // ICONDIR.count
            writer.Write((byte)(normalized.Width >= 256 ? 0 : normalized.Width));
            writer.Write((byte)(normalized.Height >= 256 ? 0 : normalized.Height));
            writer.Write((byte)0);    // palette size
            writer.Write((byte)0);    // reserved
            writer.Write((ushort)1);  // planes
            writer.Write((ushort)32); // bpp
            writer.Write((uint)normalized.Bytes.Length);
            writer.Write((uint)22);   // image offset: 6 byte header + 16 byte entry
            writer.Write(normalized.Bytes);
        }

        foreach (var stale in Directory.EnumerateFiles(iconDirectory, "shell-*.ico", SearchOption.TopDirectoryOnly))
        {
            if (PathsEqual(stale, iconPath)) continue;
            try
            {
                if (File.GetLastWriteTimeUtc(stale) < DateTime.UtcNow.AddDays(-30))
                    File.Delete(stale);
            }
            catch { }
        }

        return iconPath;
    }

    private static (byte[] Bytes, int Width, int Height) NormalizePngForShell(byte[] pngBytes)
    {
        using var imageStream = new MemoryStream(pngBytes, writable: false);
        var decoder = BitmapDecoder.Create(imageStream, BitmapCreateOptions.PreservePixelFormat, BitmapCacheOption.OnLoad);
        BitmapSource source = decoder.Frames.FirstOrDefault()
                              ?? throw new InvalidDataException("Selected icon has no image frame.");

        if (source.PixelWidth > 256 || source.PixelHeight > 256)
        {
            var scale = Math.Min(256d / source.PixelWidth, 256d / source.PixelHeight);
            var scaled = new TransformedBitmap(source, new ScaleTransform(scale, scale));
            scaled.Freeze();
            source = scaled;
        }

        var encoder = new PngBitmapEncoder();
        encoder.Frames.Add(BitmapFrame.Create(source));
        using var output = new MemoryStream();
        encoder.Save(output);
        return (output.ToArray(), source.PixelWidth, source.PixelHeight);
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
