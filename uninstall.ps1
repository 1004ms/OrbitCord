[CmdletBinding()]
param(
    [switch]$PurgeUserData
)

$ErrorActionPreference = 'Stop'
$installDir = Join-Path $env:LOCALAPPDATA 'Programs\OrbitCord'
$userData = Join-Path $env:LOCALAPPDATA 'OrbitCord'
$startMenu = Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\OrbitCord.lnk'
$desktop = Join-Path ([Environment]::GetFolderPath('DesktopDirectory')) 'OrbitCord.lnk'

Get-Process OrbitCord -ErrorAction SilentlyContinue | Stop-Process -Force
Remove-Item $installDir -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $startMenu -Force -ErrorAction SilentlyContinue
Remove-Item $desktop -Force -ErrorAction SilentlyContinue

if ($PurgeUserData) {
    Remove-Item $userData -Recurse -Force -ErrorAction SilentlyContinue
    Write-Host 'OrbitCord and user data removed.' -ForegroundColor Green
} else {
    Write-Host 'OrbitCord removed. User data was preserved in %LocalAppData%\OrbitCord.' -ForegroundColor Green
}
