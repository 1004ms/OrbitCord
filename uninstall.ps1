[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$managedStateKey = 'HKCU:\Software\OrbitCord'
$legacyUninstallKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\OrbitCord'
$defaultInstallDir = Join-Path $env:LOCALAPPDATA 'Programs\OrbitCord'
$localData = Join-Path $env:LOCALAPPDATA 'OrbitCord'
$roamingData = Join-Path $env:APPDATA 'OrbitCord'
$failures = New-Object System.Collections.Generic.List[string]

function Normalize-OrbitCordPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path)) { return $null }
    try { return [IO.Path]::GetFullPath([Environment]::ExpandEnvironmentVariables($Path.Trim().Trim('"'))).TrimEnd('\') }
    catch { return $Path.Trim().Trim('"').TrimEnd('\') }
}

function Remove-OrbitCordPath([string]$Path) {
    if ([string]::IsNullOrWhiteSpace($Path) -or -not (Test-Path -LiteralPath $Path)) { return }
    for ($attempt = 1; $attempt -le 3; $attempt++) {
        try {
            Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
            if (-not (Test-Path -LiteralPath $Path)) { return }
        }
        catch {
            if ($attempt -eq 3) {
                $failures.Add("$Path :: $($_.Exception.Message)")
                return
            }
            Start-Sleep -Milliseconds 250
        }
    }
}

function Stop-OrbitCord {
    @(Get-Process OrbitCord -ErrorAction SilentlyContinue) | ForEach-Object {
        try { Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue } catch { }
    }
    for ($i = 0; $i -lt 30; $i++) {
        if (-not (Get-Process OrbitCord -ErrorAction SilentlyContinue)) { return }
        Start-Sleep -Milliseconds 100
    }
}

$managedInstallDir = $null
try {
    $entry = Get-ItemProperty -LiteralPath $managedStateKey -ErrorAction SilentlyContinue
    if ($entry -and -not [string]::IsNullOrWhiteSpace([string]$entry.InstallLocation)) {
        $managedInstallDir = Normalize-OrbitCordPath ([string]$entry.InstallLocation)
    }
}
catch { }

$legacyInstallDir = $null
try {
    $entry = Get-ItemProperty -LiteralPath $legacyUninstallKey -ErrorAction SilentlyContinue
    if ($entry -and -not [string]::IsNullOrWhiteSpace([string]$entry.InstallLocation)) {
        $legacyInstallDir = Normalize-OrbitCordPath ([string]$entry.InstallLocation)
    }
}
catch { }

$installLocations = @(
    (Normalize-OrbitCordPath $defaultInstallDir),
    $managedInstallDir,
    $legacyInstallDir
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique
$managedExecutables = @($installLocations | ForEach-Object { Normalize-OrbitCordPath (Join-Path $_ 'OrbitCord.exe') })

function Remove-OrbitCordShortcuts([string]$Folder, [switch]$Recurse) {
    if ([string]::IsNullOrWhiteSpace($Folder) -or -not (Test-Path -LiteralPath $Folder)) { return }
    $shell = $null
    try { $shell = New-Object -ComObject WScript.Shell } catch { }

    $params = @{ LiteralPath = $Folder; Filter = '*.lnk'; File = $true; ErrorAction = 'SilentlyContinue' }
    if ($Recurse) { $params.Recurse = $true }
    foreach ($item in Get-ChildItem @params) {
        $remove = $item.Name -like 'OrbitCord*.lnk' -or $item.Name -like '*(OrbitCord)*.lnk'
        if (-not $remove -and $shell) {
            $shortcut = $null
            try {
                $shortcut = $shell.CreateShortcut($item.FullName)
                $target = Normalize-OrbitCordPath ([string]$shortcut.TargetPath)
                $description = [string]$shortcut.Description
                if ($managedExecutables -contains $target -or $description -like '*OrbitCord*') { $remove = $true }
            }
            catch { }
            finally {
                if ($shortcut) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut) } catch { } }
            }
        }
        if ($remove) { Remove-OrbitCordPath $item.FullName }
    }

    if ($shell) { try { [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell) } catch { } }
}

Write-Host 'Closing OrbitCord...' -ForegroundColor Cyan
Stop-OrbitCord

Write-Host 'Removing OrbitCord shortcuts and taskbar pins...' -ForegroundColor Cyan
$desktop = [Environment]::GetFolderPath('DesktopDirectory')
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs'
$pinnedTaskbar = Join-Path $env:APPDATA 'Microsoft\Internet Explorer\Quick Launch\User Pinned\TaskBar'
$recent = Join-Path $env:APPDATA 'Microsoft\Windows\Recent'
Remove-OrbitCordShortcuts $desktop
Remove-OrbitCordShortcuts $startMenu -Recurse
Remove-OrbitCordShortcuts $pinnedTaskbar
Remove-OrbitCordShortcuts $recent

Write-Host 'Removing OrbitCord program files and legacy backups...' -ForegroundColor Cyan
foreach ($location in $installLocations) {
    if ([string]::IsNullOrWhiteSpace($location)) { continue }
    $parent = Split-Path -Parent $location
    $leaf = Split-Path -Leaf $location
    Remove-OrbitCordPath $location
    if (Test-Path -LiteralPath $parent) {
        Get-ChildItem -LiteralPath $parent -Directory -Filter "$leaf.backup-*" -ErrorAction SilentlyContinue |
            ForEach-Object { Remove-OrbitCordPath $_.FullName }
    }
}

# Historical default backup format from old install.ps1 / GUI Setup.
$programsDir = Join-Path $env:LOCALAPPDATA 'Programs'
if (Test-Path -LiteralPath $programsDir) {
    Get-ChildItem -LiteralPath $programsDir -Directory -Filter 'OrbitCord.backup-*' -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-OrbitCordPath $_.FullName }
}

Write-Host 'Removing OrbitCord settings, WebView2 profile, logs, icon cache and roaming data...' -ForegroundColor Cyan
Remove-OrbitCordPath $localData
Remove-OrbitCordPath $roamingData

Write-Host 'Removing old OrbitCord temporary/Setup files...' -ForegroundColor Cyan
$tempDir = [IO.Path]::GetTempPath()
if (Test-Path -LiteralPath $tempDir) {
    Get-ChildItem -LiteralPath $tempDir -Directory -Filter 'OrbitCord-*' -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-OrbitCordPath $_.FullName }
    Get-ChildItem -LiteralPath $tempDir -Directory -Filter 'OrbitCord-Setup-*' -ErrorAction SilentlyContinue |
        ForEach-Object { Remove-OrbitCordPath $_.FullName }
}

Write-Host 'Removing OrbitCord registry state and legacy Apps/Features registration...' -ForegroundColor Cyan
foreach ($registryPath in @($managedStateKey, $legacyUninstallKey)) {
    try {
        if (Test-Path -LiteralPath $registryPath) {
            Remove-Item -LiteralPath $registryPath -Recurse -Force -ErrorAction Stop
        }
    }
    catch {
        $failures.Add("$registryPath :: $($_.Exception.Message)")
    }
}

if ($failures.Count -gt 0) {
    Write-Warning 'OrbitCord uninstall finished with files Windows would not let us remove:'
    foreach ($failure in $failures) { Write-Warning "  $failure" }
    throw 'OrbitCord uninstall was not fully clean. Close any process locking the listed paths and run uninstall.ps1 again.'
}

Write-Host 'OrbitCord was completely removed for this Windows user.' -ForegroundColor Green
Write-Host 'Program files, user data, backups, temporary files, shortcuts, pins and legacy Setup registration were removed.'
