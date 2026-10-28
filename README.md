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

Open **PowerShell** and run:

```powershell
irm https://raw.githubusercontent.com/1004ms/OrbitCord/main/install.ps1 | iex
```

OrbitCord is installed to:

```text
%LocalAppData%\Programs\OrbitCord
```

Your settings, WebView2 profile and logs stay in `%LocalAppData%\OrbitCord`, outside the program directory, so updates do not overwrite them.

### Update

```powershell
irm https://raw.githubusercontent.com/1004ms/OrbitCord/main/update.ps1 | iex
```

### Uninstall

```powershell
irm https://raw.githubusercontent.com/1004ms/OrbitCord/main/uninstall.ps1 | iex
```

The uninstall command preserves `%LocalAppData%\OrbitCord` by default. Run the downloaded `uninstall.ps1` with `-PurgeUserData` if you also want to remove local settings and the WebView2 profile.

## How releases are secured

The PowerShell installer does not trust a downloaded ZIP blindly.

For every GitHub Release the workflow publishes:

- `OrbitCord-win-x64.zip`
- `OrbitCord-win-x64.zip.sha256`

`install.ps1` downloads both, computes SHA-256 locally with `Get-FileHash`, compares it with the published checksum, then performs an atomic replace with rollback if installation fails.

## Requirements

The public release ZIP is **self-contained**, so users do not need to install the .NET runtime separately.

You still need:

- Windows 10/11 x64;
- Microsoft Edge WebView2 Runtime.

The WebView2 Runtime is already present on most supported Windows systems.

## Development

Requirements:

- .NET 10 SDK
- Node.js 20+
- Git

Run the full test suite and launch the development build:

```powershell
.\RUN-DEV.bat
```

Run tests only:

```powershell
.\scripts\Test-OrbitCord.ps1
```

Build a local Windows package:

```powershell
.\BUILD-WINDOWS.bat
```

For a self-contained package:

```powershell
.\scripts\Build-OrbitCord.ps1 -SelfContained
```

## Publishing the repository for the first time

The source package is repository-owner agnostic. `BOOTSTRAP-GITHUB.ps1` detects the currently authenticated GitHub account by default, or you can pass `-Repository owner/name`.

After installing and authenticating the GitHub CLI (`gh auth login`), run once:

```powershell
.\BOOTSTRAP-GITHUB.ps1
```

It binds the generic repository placeholders to the selected `owner/name`, initializes Git when necessary, creates the repository as **public**, pushes `main`, creates the current version tag and queues the first GitHub Release.

## Publishing an update

Do not manually build ZIP files and upload them to GitHub.

Use:

```powershell
.\PUBLISH-UPDATE.ps1 -Version 0.6.2
```

Or a prerelease:

```powershell
.\PUBLISH-UPDATE.ps1 -Version 0.6.2-beta.1
```

The command:

1. requires a clean Git working tree;
2. updates the centralized version metadata;
3. runs the complete .NET + Web/static test suite;
4. creates the release commit;
5. creates the `v<version>` Git tag;
6. pushes `main` and the tag;
7. waits for `.github/workflows/release.yml`;
8. GitHub Actions builds the self-contained Windows package, creates the checksum and publishes the GitHub Release.

This means the downloadable release is always built by GitHub from the tagged public source.

## CI

Every push and pull request to `main` runs `.github/workflows/ci.yml` on Windows and checks:

- .NET restore and tests;
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
