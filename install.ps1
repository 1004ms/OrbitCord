[CmdletBinding()]
param(
    [switch]$UpdateOnly,
    [switch]$DesktopShortcut,
    [switch]$NoLaunch,
    [string]$Repository = '1004ms/OrbitCord'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = $Repository
$unconfiguredRepository = '__ORBITCORD_' + 'REPOSITORY__'
if ([string]::IsNullOrWhiteSpace($repo) -or $repo -eq $unconfiguredRepository) {
    throw 'Repository is not configured.'
}

$headers = @{
    'User-Agent' = 'OrbitCord-PowerShell'
    'Accept' = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
}
$apiBase = "https://api.github.com/repos/$repo"
$defaultInstallDir = Join-Path $env:LOCALAPPDATA 'Programs\OrbitCord'
$managedStateKey = 'HKCU:\Software\OrbitCord'
$legacyUninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\OrbitCord'


function Get-ManagedInstallLocation {
    try {
        $entry = Get-ItemProperty -LiteralPath $managedStateKey -ErrorAction SilentlyContinue
        if ($entry -and -not [string]::IsNullOrWhiteSpace([string]$entry.InstallLocation)) {
            return [Environment]::ExpandEnvironmentVariables(([string]$entry.InstallLocation).Trim().Trim('"'))
        }
    }
    catch { }
    return $null
}

function Save-ManagedInstallState([string]$InstallDirectory, [string]$Version) {
    New-Item -Path $managedStateKey -Force | Out-Null
    Set-ItemProperty -LiteralPath $managedStateKey -Name 'InstallLocation' -Value $InstallDirectory -Force
    Set-ItemProperty -LiteralPath $managedStateKey -Name 'Version' -Value $Version -Force
}

function Get-LegacyInstallLocation {
    try {
        $entry = Get-ItemProperty -LiteralPath $legacyUninstallKey -ErrorAction SilentlyContinue
        if ($entry -and -not [string]::IsNullOrWhiteSpace([string]$entry.InstallLocation)) {
            return [Environment]::ExpandEnvironmentVariables(([string]$entry.InstallLocation).Trim().Trim('"'))
        }
    }
    catch { }
    return $null
}

function Remove-LegacySetupState([string]$InstallDirectory) {
    try { Remove-Item -LiteralPath $legacyUninstallKey -Recurse -Force -ErrorAction SilentlyContinue } catch { }
    if (-not [string]::IsNullOrWhiteSpace($InstallDirectory)) {
        Remove-Item -LiteralPath (Join-Path $InstallDirectory 'OrbitCord-Setup.exe') -Force -ErrorAction SilentlyContinue
    }
}

function Remove-StaleOrbitCordBackups([string]$InstallDirectory) {
    if ([string]::IsNullOrWhiteSpace($InstallDirectory)) { return }
    try {
        $parent = Split-Path -Parent $InstallDirectory
        $leaf = Split-Path -Leaf $InstallDirectory
        if (Test-Path -LiteralPath $parent) {
            Get-ChildItem -LiteralPath $parent -Directory -Filter "$leaf.backup-*" -ErrorAction SilentlyContinue |
                Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    catch { }
}

function Get-LatestOrbitCordRelease {
    return Invoke-RestMethod -Headers $headers -Uri "$apiBase/releases/latest"
}

function Get-ReleaseAsset($Release, [string]$Name) {
    return $Release.assets | Where-Object { $_.name -eq $Name } | Select-Object -First 1
}

function Stop-OrbitCord {
    $processes = @(Get-Process OrbitCord -ErrorAction SilentlyContinue)
    foreach ($process in $processes) {
        try { Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
    for ($i = 0; $i -lt 30; $i++) {
        if (-not (Get-Process OrbitCord -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 100
    }
    if (Get-Process OrbitCord -ErrorAction SilentlyContinue) {
        throw 'OrbitCord is still running. Close it and run the command again.'
    }
}

function Copy-DirectoryContents([string]$Source, [string]$Destination) {
    New-Item -ItemType Directory -Path $Destination -Force | Out-Null
    Get-ChildItem -LiteralPath $Source -Force | Copy-Item -Destination $Destination -Recurse -Force
}

function New-OrbitCordShortcut([string]$ShortcutPath, [string]$ExePath) {
    $parent = Split-Path -Parent $ShortcutPath
    New-Item -ItemType Directory -Path $parent -Force | Out-Null
    $shell = $null
    $shortcut = $null
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($ShortcutPath)
        $shortcut.TargetPath = $ExePath
        $shortcut.WorkingDirectory = Split-Path -Parent $ExePath
        $shortcut.IconLocation = "$ExePath,0"
        $shortcut.Description = 'OrbitCord'
        $shortcut.Save()
    }
    finally {
        if ($shortcut) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut) } catch { } }
        if ($shell) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) } catch { } }
    }
}

$managedInstallDir = Get-ManagedInstallLocation
$legacyInstallDir = Get-LegacyInstallLocation
$installDir = $defaultInstallDir
foreach ($candidate in @($managedInstallDir, $legacyInstallDir, $defaultInstallDir)) {
    if (-not [string]::IsNullOrWhiteSpace($candidate) -and (Test-Path -LiteralPath (Join-Path $candidate 'OrbitCord.exe'))) {
        $installDir = $candidate
        break
    }
}

$versionFile = Join-Path $installDir '.orbitcord-version'
$installedExe = Join-Path $installDir 'OrbitCord.exe'
if ($UpdateOnly -and -not (Test-Path -LiteralPath $installedExe)) {
    throw "OrbitCord is not installed. Expected: $installedExe"
}

Write-Host 'Checking the latest OrbitCord GitHub release...' -ForegroundColor Cyan
$release = Get-LatestOrbitCordRelease
$tag = [string]$release.tag_name
if ([string]::IsNullOrWhiteSpace($tag)) { throw 'GitHub latest release did not contain a tag name.' }
$displayVersion = $tag.TrimStart('v', 'V')

$zipAsset = Get-ReleaseAsset $release 'OrbitCord-win-x64.zip'
$hashAsset = Get-ReleaseAsset $release 'OrbitCord-win-x64.zip.sha256'
if (-not $zipAsset -or -not $hashAsset) {
    throw "Release $tag is missing OrbitCord-win-x64.zip or OrbitCord-win-x64.zip.sha256."
}

if ((Test-Path -LiteralPath $installedExe) -and (Test-Path -LiteralPath $versionFile)) {
    $installedVersion = (Get-Content -LiteralPath $versionFile -Raw).Trim()
    if ($installedVersion -eq $displayVersion) {
        Save-ManagedInstallState $installDir $displayVersion
        Remove-LegacySetupState $installDir
        Remove-StaleOrbitCordBackups $installDir
        Write-Host "OrbitCord $displayVersion is already up to date." -ForegroundColor Green
        exit 0
    }
}

$tempRoot = Join-Path ([IO.Path]::GetTempPath()) ("OrbitCord-Install-" + [guid]::NewGuid().ToString('N'))
$zipPath = Join-Path $tempRoot 'OrbitCord-win-x64.zip'
$hashPath = Join-Path $tempRoot 'OrbitCord-win-x64.zip.sha256'
$payload = Join-Path $tempRoot 'payload'
$rollback = Join-Path $tempRoot 'rollback'
$hadExistingInstall = Test-Path -LiteralPath $installDir

New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
try {
    Write-Host "Downloading OrbitCord $displayVersion..." -ForegroundColor Cyan
    Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $zipAsset.browser_download_url -OutFile $zipPath
    Invoke-WebRequest -UseBasicParsing -Headers $headers -Uri $hashAsset.browser_download_url -OutFile $hashPath

    $expectedHash = ((Get-Content -LiteralPath $hashPath -Raw).Trim() -split '\s+')[0].ToLowerInvariant()
    if ($expectedHash -notmatch '^[0-9a-f]{64}$') { throw 'Published SHA256 file is invalid.' }
    $actualHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($expectedHash -ne $actualHash) {
        throw "SHA256 verification failed. Expected $expectedHash, got $actualHash."
    }
    Write-Host 'SHA256 verified.' -ForegroundColor Green

    New-Item -ItemType Directory -Path $payload -Force | Out-Null
    Expand-Archive -LiteralPath $zipPath -DestinationPath $payload -Force
    $payloadExe = Join-Path $payload 'OrbitCord.exe'
    if (-not (Test-Path -LiteralPath $payloadExe)) { throw 'Release archive does not contain OrbitCord.exe.' }

    Stop-OrbitCord

    if ($hadExistingInstall) {
        Write-Host 'Creating temporary rollback copy...' -ForegroundColor DarkGray
        Copy-DirectoryContents $installDir $rollback
    }

    try {
        Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
        New-Item -ItemType Directory -Path $installDir -Force | Out-Null
        Copy-DirectoryContents $payload $installDir
        Set-Content -LiteralPath $versionFile -Value $displayVersion -Encoding ascii

        if (-not (Test-Path -LiteralPath $installedExe)) {
            throw 'OrbitCord.exe was not installed successfully.'
        }
    }
    catch {
        Write-Warning 'Install/update failed. Restoring the previous OrbitCord files.'
        Remove-Item -LiteralPath $installDir -Recurse -Force -ErrorAction SilentlyContinue
        if ($hadExistingInstall -and (Test-Path -LiteralPath $rollback)) {
            Copy-DirectoryContents $rollback $installDir
        }
        throw
    }

    Save-ManagedInstallState $installDir $displayVersion

    # 1.1.7 removes the historical GUI Setup and its Apps/Features registration.
    Remove-LegacySetupState $installDir
    Remove-StaleOrbitCordBackups $installDir
    Get-ChildItem -LiteralPath ([IO.Path]::GetTempPath()) -Directory -Filter 'OrbitCord-Setup-*' -ErrorAction SilentlyContinue |
        Remove-Item -Recurse -Force -ErrorAction SilentlyContinue

    if (-not $UpdateOnly) {
        try {
            $startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\OrbitCord.lnk'
            New-OrbitCordShortcut $startMenu $installedExe
            if ($DesktopShortcut) {
                $desktop = [Environment]::GetFolderPath('DesktopDirectory')
                New-OrbitCordShortcut (Join-Path $desktop 'OrbitCord.lnk') $installedExe
            }
        }
        catch {
            Write-Warning "OrbitCord installed, but shortcut creation failed: $($_.Exception.Message)"
        }
    }

    $verb = if ($UpdateOnly) { 'updated' } else { 'installed' }
    Write-Host "OrbitCord $displayVersion $verb successfully." -ForegroundColor Green
    Write-Host "Install directory: $installDir"

    if (-not $NoLaunch) {
        Start-Process -FilePath $installedExe -WorkingDirectory $installDir
    }
}
finally {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
}
