[CmdletBinding()]
param(
    [switch]$UpdateOnly,
    [switch]$StableOnly,
    [string]$Version,
    [switch]$DesktopShortcut,
    [switch]$NoLaunch,
    [string]$Repository = '1004ms/OrbitCord'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = $Repository
$unconfiguredRepository = '__ORBITCORD_' + 'REPOSITORY__'
if ([string]::IsNullOrWhiteSpace($repo) -or $repo -eq $unconfiguredRepository) {
    throw 'Repository is not configured. Run BOOTSTRAP-GITHUB.ps1 before publishing OrbitCord.'
}
$apiBase = "https://api.github.com/repos/$repo"
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\OrbitCord'
$versionFile = Join-Path $installDir '.orbitcord-version'
$headers = @{
    'User-Agent' = 'OrbitCord-PowerShell-Installer'
    'Accept' = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}

function Get-OrbitCordRelease {
    if ($Version) {
        $tag = if ($Version.StartsWith('v')) { $Version } else { "v$Version" }
        return Invoke-RestMethod -Headers $headers -Uri "$apiBase/releases/tags/$tag"
    }

    $releases = @(Invoke-RestMethod -Headers $headers -Uri "$apiBase/releases?per_page=20")
    $release = $releases |
        Where-Object { -not $_.draft -and (-not $StableOnly -or -not $_.prerelease) } |
        Select-Object -First 1
    if (-not $release) {
        if ($StableOnly) { throw 'No stable OrbitCord release is available yet.' }
        throw 'No OrbitCord release is available yet.'
    }
    return $release
}

function New-OrbitCordShortcut([string]$ShortcutPath, [string]$ExePath) {
    $parent = Split-Path -Parent $ShortcutPath
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($ShortcutPath)
    $shortcut.TargetPath = $ExePath
    $shortcut.WorkingDirectory = Split-Path -Parent $ExePath
    $shortcut.IconLocation = "$ExePath,0"
    $shortcut.Description = 'OrbitCord'
    $shortcut.Save()
}

$release = Get-OrbitCordRelease
$tag = [string]$release.tag_name
$displayVersion = $tag.TrimStart('v')

if ($UpdateOnly -and -not (Test-Path $installDir)) {
    throw "OrbitCord is not installed at $installDir. Run install.ps1 first."
}

if (Test-Path $versionFile) {
    $installedVersion = (Get-Content $versionFile -Raw).Trim()
    if ($installedVersion -eq $displayVersion) {
        Write-Host "OrbitCord $displayVersion is already installed." -ForegroundColor Green
        exit 0
    }
}

$zipAsset = $release.assets | Where-Object name -eq 'OrbitCord-win-x64.zip' | Select-Object -First 1
$hashAsset = $release.assets | Where-Object name -eq 'OrbitCord-win-x64.zip.sha256' | Select-Object -First 1
if (-not $zipAsset -or -not $hashAsset) {
    throw "Release $tag is missing OrbitCord-win-x64.zip or its SHA256 file."
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("OrbitCord-" + [guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempRoot 'OrbitCord-win-x64.zip'
$hashPath = "$zipPath.sha256"
$payload = Join-Path $tempRoot 'payload'
$backup = "$installDir.backup-$(Get-Date -Format yyyyMMddHHmmss)"

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
try {
    Write-Host "Downloading OrbitCord $displayVersion..." -ForegroundColor Cyan
    Invoke-WebRequest -Headers $headers -Uri $zipAsset.browser_download_url -OutFile $zipPath
    Invoke-WebRequest -Headers $headers -Uri $hashAsset.browser_download_url -OutFile $hashPath

    $expectedHash = ((Get-Content $hashPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    $actualHash = (Get-FileHash $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expectedHash -ne $actualHash) {
        throw "SHA256 verification failed. Expected $expectedHash, got $actualHash."
    }
    Write-Host 'SHA256 verified.' -ForegroundColor Green

    New-Item -ItemType Directory -Path $payload -Force | Out-Null
    Expand-Archive -Path $zipPath -DestinationPath $payload -Force
    $newExe = Join-Path $payload 'OrbitCord.exe'
    if (-not (Test-Path $newExe)) { throw 'Release archive does not contain OrbitCord.exe.' }

    Get-Process OrbitCord -ErrorAction SilentlyContinue | Stop-Process -Force
    Start-Sleep -Milliseconds 250

    if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
    if (Test-Path $installDir) {
        Move-Item -Path $installDir -Destination $backup
    }

    try {
        New-Item -ItemType Directory -Path (Split-Path -Parent $installDir) -Force | Out-Null
        Move-Item -Path $payload -Destination $installDir
        Set-Content -Path $versionFile -Value $displayVersion -Encoding ascii

        $exe = Join-Path $installDir 'OrbitCord.exe'
        $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\OrbitCord.lnk'
        New-OrbitCordShortcut $startMenu $exe
        if ($DesktopShortcut) {
            $desktop = [Environment]::GetFolderPath('DesktopDirectory')
            New-OrbitCordShortcut (Join-Path $desktop 'OrbitCord.lnk') $exe
        }

        if (Test-Path $backup) { Remove-Item $backup -Recurse -Force }
    }
    catch {
        Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
        if (Test-Path $backup) { Move-Item $backup $installDir }
        throw
    }

    $verb = if ($UpdateOnly) { 'updated' } else { 'installed' }
    Write-Host "OrbitCord $displayVersion $verb successfully." -ForegroundColor Green
    Write-Host "Install directory: $installDir"
    Write-Host 'User data remains in %LocalAppData%\OrbitCord and is never replaced by updates.'

    if (-not $NoLaunch) {
        Start-Process (Join-Path $installDir 'OrbitCord.exe')
    }
}
finally {
    Remove-Item $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
