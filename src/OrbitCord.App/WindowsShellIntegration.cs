using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Windows;
using System.Windows.Media;
using System.Windows.Media.Imaging;

namespace OrbitCord.App;

/// <summary>
/// Best-effort shortcut cosmetics only.
///
/// Important: this helper intentionally contains no P/Invoke, no manual PROPVARIANT marshalling,
/// and no live-window native calls. A custom icon/name must never be able to terminate OrbitCord.
/// The running window uses ordinary WPF Title/Icon properties; this class only persists the same
/// cosmetics to existing OrbitCord shortcuts when the user explicitly changes customisation.
/// </summary>
internal static class WindowsShellIntegration
{
    private static readonly int[] ShellIconSizes = [16, 24, 32, 48, 64, 128, 256];

    public static void SyncAppearance(string displayName, string pngIconPath, FileLogger? logger)
    {
        try
        {
            var executablePath = Environment.ProcessPath;
            if (string.IsNullOrWhiteSpace(executablePath) || !File.Exists(executablePath)) return;
            if (string.IsNullOrWhiteSpace(pngIconPath) || !File.Exists(pngIconPath)) return;

            // Build and validate the ICO before touching a single shortcut. If generation fails,
            // every existing shortcut keeps its previous known-good IconLocation.
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

                // Desktop/Start names are visible filenames, so rename them transactionally.
                // Pinned taskbar links keep their filename to avoid destabilising the pin; their
                // Description and IconLocation are still updated to the selected display name/icon.
                SyncShortcutFolder(shell, desktop, executablePath, displayName, iconPath, renameShortcut: true);
                SyncShortcutFolder(shell, startMenu, executablePath, displayName, iconPath, renameShortcut: true);
                SyncShortcutFolder(shell, pinnedTaskbar, executablePath, displayName, iconPath, renameShortcut: false);
            }
            finally
            {
                ReleaseComObject(shellObject);
            }

            logger?.Write($"Windows shortcut cosmetics synchronized as '{displayName}'.");
        }
        catch (Exception ex)
        {
            // Cosmetic integration is deliberately non-fatal.
            logger?.Write($"Windows shortcut cosmetic synchronization failed: {ex.Message}");
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
            if (!ShortcutTargetsExecutable(shell, shortcutPath, executablePath)) continue;
            if (!UpdateShortcut(shell, shortcutPath, displayName, iconPath)) continue;
            if (!renameShortcut) continue;

            var desiredPath = Path.Combine(folder, SanitizeShortcutFileName(displayName) + ".lnk");
            _ = CreateRenamedShortcut(
                shell,
                shortcutPath,
                desiredPath,
                executablePath,
                displayName,
                iconPath);
        }
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
            return false;
        }
        finally
        {
            ReleaseComObject(shortcutObject);
        }
    }

    /// <summary>
    /// Creates and verifies the replacement before deleting the old filename. If anything fails,
    /// the original shortcut remains in place and usable.
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

        if (File.Exists(desiredPath))
        {
            if (!ShortcutTargetsExecutable(shell, desiredPath, executablePath)) return shortcutPath;
            if (!UpdateShortcut(shell, desiredPath, displayName, iconPath)) return shortcutPath;
            if (!ShortcutTargetsExecutable(shell, desiredPath, executablePath)) return shortcutPath;
            TryDeleteOldShortcut(shortcutPath, desiredPath);
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
            destination.WorkingDirectory = (string?)source.WorkingDirectory
                                           ?? Path.GetDirectoryName(executablePath)
                                           ?? string.Empty;
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

        if (!File.Exists(desiredPath) || !ShortcutTargetsExecutable(shell, desiredPath, executablePath))
        {
            try { File.Delete(desiredPath); } catch { }
            return shortcutPath;
        }

        TryDeleteOldShortcut(shortcutPath, desiredPath);
        return desiredPath;
    }

    private static void TryDeleteOldShortcut(string shortcutPath, string desiredPath)
    {
        if (PathsEqual(shortcutPath, desiredPath)) return;
        try
        {
            if (File.Exists(shortcutPath)) File.Delete(shortcutPath);
        }
        catch
        {
            // Keeping two valid links is preferable to losing the only usable shortcut.
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
        var hashInput = sourcePngBytes.Concat("orbitcord-shell-icon-v5"u8.ToArray()).ToArray();
        var hash = Convert.ToHexString(SHA256.HashData(hashInput)).Substring(0, 16).ToLowerInvariant();
        var iconDirectory = Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "OrbitCord", "Customization", "ShellIcons");
        Directory.CreateDirectory(iconDirectory);
        var iconPath = Path.Combine(iconDirectory, $"shell-v5-{hash}.ico");

        if (File.Exists(iconPath) && ValidateShellIcon(iconPath)) return iconPath;

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

        writer.Write((ushort)0);
        writer.Write((ushort)1);
        writer.Write((ushort)frames.Count);

        foreach (var frame in frames)
        {
            writer.Write((byte)(frame.Size >= 256 ? 0 : frame.Size));
            writer.Write((byte)(frame.Size >= 256 ? 0 : frame.Size));
            writer.Write((byte)0);
            writer.Write((byte)0);
            writer.Write((ushort)1);
            writer.Write((ushort)32);
            writer.Write((uint)frame.Bytes.Length);
            writer.Write((uint)offset);
            offset += frame.Bytes.Length;
        }

        foreach (var frame in frames) writer.Write(frame.Bytes);
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
            return ShellIconSizes.All(sizes.Contains)
                   && decoder.Frames.All(frame => frame.PixelWidth == frame.PixelHeight);
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
                if (File.GetLastWriteTimeUtc(stale) < DateTime.UtcNow.AddDays(-90)) File.Delete(stale);
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
            // Best-effort cleanup only.
        }
    }
}
