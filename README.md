# OrbitCord

OrbitCord is a lightweight Discord Web client for Windows built with **.NET 10 WPF + Microsoft WebView2**.

It loads `https://discord.com/app` in its own Windows shell and adds a small native layer around Discord Web. OrbitCord does **not** modify the official Discord installation, patch `app.asar`, inject into Discord Desktop, or ship Vencord as a runtime dependency.

## Features

- native Windows window around Discord Web;
- global **Mute microphone** and **Deafen** shortcuts;
- local OrbitCord customisation: theme color, custom icon and app rename;
- WebView2 memory governor and low-overhead performance diagnostics;
- user state stored under `%LocalAppData%\OrbitCord`;
- source-first public release pipeline with SHA-256 verified updates.

## Install

### Recommended: OrbitCord Setup

Download **`OrbitCord-Setup.exe`** from the latest GitHub Release and run it.

The graphical installer lets you:

- choose the OrbitCord installation folder;
- optionally create a Desktop shortcut;
- install a Start Menu shortcut;
- register OrbitCord in Windows **Installed apps** with an uninstaller;
- install, update or uninstall OrbitCord from the same compact interface;
- choose whether OrbitCord should launch when setup finishes (off by default).

The default install location is:

```text
%LocalAppData%\Programs\OrbitCord
```

Your settings, WebView2 profile and logs stay in `%LocalAppData%\OrbitCord`, outside the program directory, so updates and uninstalls do not overwrite them.

### PowerShell quick install

The existing PowerShell installer remains available as a lightweight fallback:

```powershell
irm https://raw.githubusercontent.com/1004ms/OrbitCord/main/install.ps1 | iex
```

### Update with PowerShell

```powershell
irm https://raw.githubusercontent.com/1004ms/OrbitCord/main/update.ps1 | iex
```

### Uninstall

The GUI installer registers OrbitCord in **Settings → Apps → Installed apps**, where it can be uninstalled normally.

The PowerShell uninstall path also remains available:

```powershell
irm https://raw.githubusercontent.com/1004ms/OrbitCord/main/uninstall.ps1 | iex
```

The uninstall flows preserve `%LocalAppData%\OrbitCord` by default.

## How releases are secured

The installers do not trust downloaded program files blindly.

For every GitHub Release the workflow publishes:

- `OrbitCord-win-x64.zip`
- `OrbitCord-win-x64.zip.sha256`
- `OrbitCord-Setup.exe`
- `OrbitCord-Setup.exe.sha256`

Both the PowerShell installer and the graphical setup download the matching release ZIP, compute SHA-256 locally, compare it with the published checksum, then replace the program files only after verification succeeds. Existing program files are kept as a temporary rollback backup until the replacement is complete.

## Requirements

The public release ZIP and `OrbitCord-Setup.exe` are **self-contained**, so users do not need to install the .NET runtime separately.

You still need:

- Windows 10/11 x64;
- Microsoft Edge WebView2 Runtime.

The WebView2 Runtime is already present on most supported Windows systems.

## Development

Requirements:

- .NET 10 SDK
- Node.js 20+
- Git

Run the development build:

```powershell
.\scripts\Run-Dev.ps1
```

Run the full test suite:

```powershell
.\scripts\Test-OrbitCord.ps1
```

The test gate builds both `OrbitCord.App` and `OrbitCord.Installer` before running the .NET and Web/static tests.

Build a local Windows package:

```powershell
.\scripts\Build-OrbitCord.ps1
```

For a self-contained app package:

```powershell
.\scripts\Build-OrbitCord.ps1 -SelfContained
```

## Publishing an update

Do not manually build ZIP files or setup executables and upload them to GitHub.

Use:

```powershell
.\PUBLISH-UPDATE.ps1 -Version 1.1.2
```

Or a prerelease:

```powershell
.\PUBLISH-UPDATE.ps1 -Version 1.1.2-beta.1
```

The command:

1. requires a clean Git working tree;
2. updates the centralized version metadata;
3. runs the complete .NET + Web/static test suite;
4. creates the release commit;
5. creates the `v<version>` Git tag;
6. pushes `main` and the tag;
7. waits for `.github/workflows/release.yml`;
8. GitHub Actions builds the self-contained Windows app and GUI installer, creates checksums and publishes the GitHub Release.

This means the downloadable release is always built by GitHub from the tagged public source.

## CI

Every push and pull request to `main` runs `.github/workflows/ci.yml` on Windows and checks:

- .NET restore and tests;
- compilation of the OrbitCord app and GUI installer;
- Web/DOM/static Node tests;
- a Windows publish build.

Tags matching `v*` run the release workflow.

## Local data

OrbitCord uses:

```text
%LocalAppData%\OrbitCord
```

Notable files/directories include:

- `Shortcuts.json`
- `Appearance.json`
- `Customization\custom-icon.png`
- `WebView2\`
- `Logs\`

## Privacy

OrbitCord loads Discord Web directly from `https://discord.com/app`. It does not extract account tokens and does not implement a self-bot or undocumented Discord API client.

## License

MIT. See [LICENSE](LICENSE).
