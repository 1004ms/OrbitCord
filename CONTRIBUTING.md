# Contributing

OrbitCord is a Windows/.NET + WebView2 project. Keep changes narrow and testable.

## Before opening a pull request

1. Install .NET 10 SDK and Node.js 20+.
2. Run:

```powershell
.\scripts\Test-OrbitCord.ps1
```

3. Do not commit `bin/`, `obj/`, `artifacts/`, logs, dumps or local WebView2 data.
4. Do not add Discord token extraction, self-bot behavior, `app.asar` patching or a Vencord runtime dependency.
5. Keep user state under `%LocalAppData%\OrbitCord`, not inside the install directory.

## Releases

Releases are maintainer-only and must be created with `PUBLISH-UPDATE.ps1`. Do not commit built ZIP files to the repository.
