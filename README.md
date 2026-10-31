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

OrbitCord 1.1.7+ uses a **PowerShell-only installer/update flow**. The old graphical `OrbitCord-Setup.exe` has been removed.

Open PowerShell and run:

```powershell
irm https://raw.githubusercontent.com/1004ms/OrbitCord/main/install.ps1 | iex
```

The default program location is:

```text
%LocalAppData%\Programs\OrbitCord
```

`install.ps1` resolves the current GitHub **latest release**, downloads `OrbitCord-win-x64.zip` plus its SHA-256 file, verifies the archive, then installs it. If an older GUI-Setup installation used a custom directory, OrbitCord can migrate/update that existing installation in place.

## Update

```powershell
irm https://raw.githubusercontent.com/1004ms/OrbitCord/main/update.ps1 | iex
```

`update.ps1` always uses the current PowerShell deployment engine and updates the installed client to GitHub `/releases/latest`. The old program directory is copied only into the current temporary transaction directory for rollback; successful updates leave no persistent `.backup-*` directory behind.

## Uninstall — full purge

```powershell
irm https://raw.githubusercontent.com/1004ms/OrbitCord/main/uninstall.ps1 | iex
```

Uninstall is intentionally a **full purge**. It stops OrbitCord and removes managed OrbitCord state for the current Windows user, including:

- `%LocalAppData%\Programs\OrbitCord` and any old registered custom install location;
- legacy `OrbitCord.backup-*` directories;
- `%LocalAppData%\OrbitCord` settings, icon cache, logs and WebView2 profile;
- `%AppData%\OrbitCord` if present;
- OrbitCord Desktop, Start Menu, Recent and taskbar-pin shortcuts it can identify;
- old `OrbitCord-Setup-*` temporary directories;
- the historical GUI Setup Apps/Features registry entry.

It does not delete arbitrary copies of release ZIPs or old Setup executables that you manually saved in unrelated folders such as Downloads.

## Release integrity

Every GitHub Release publishes:

- `OrbitCord-win-x64.zip`
- `OrbitCord-win-x64.zip.sha256`
- `install.ps1`
- `update.ps1`
- `uninstall.ps1`

The public ZIP is **self-contained**, so users do not need to install the .NET runtime separately. The PowerShell deployment engine verifies SHA-256 before replacing any installed files.

## Requirements

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

The test gate builds `OrbitCord.App`, runs the .NET tests and then all Web/static Node tests.

Build a local Windows package:

```powershell
.\scripts\Build-OrbitCord.ps1
```

For a self-contained app package:

```powershell
.\scripts\Build-OrbitCord.ps1 -SelfContained
```

## Publishing an update

Do not manually build or upload release binaries. Use:

```powershell
.\PUBLISH-UPDATE.ps1 -Version 1.1.7
```

Or a prerelease:

```powershell
.\PUBLISH-UPDATE.ps1 -Version 1.1.7-beta.1
```

The command checks the working tree, sets the centralized version, runs the full test suite, creates/pushes the tag and waits for `.github/workflows/release.yml`. GitHub Actions then builds the self-contained Windows ZIP, creates its SHA-256 checksum and publishes the PowerShell scripts with the release.

## CI

Every push and pull request to `main` runs `.github/workflows/ci.yml` on Windows and checks:

- .NET restore/tests;
- OrbitCord app compilation;
- Web/DOM/static Node tests;
- a Windows package build.

Tags matching `v*` run the release workflow.

## Local data

OrbitCord uses `%LocalAppData%\OrbitCord`. Notable data includes shortcut settings, appearance/customisation state, WebView2 profile and logs. `uninstall.ps1` removes all of it.

## Privacy

OrbitCord loads Discord Web directly from `https://discord.com/app`. It does not extract account tokens and does not implement a self-bot or undocumented Discord API client.

## License

MIT. See [LICENSE](LICENSE).
