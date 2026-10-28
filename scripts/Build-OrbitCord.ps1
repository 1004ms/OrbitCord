[CmdletBinding()]
param(
    [switch]$SelfContained,
    [switch]$SkipTests
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

[xml]$props = Get-Content (Join-Path $root 'Directory.Build.props')
$version = [string]$props.Project.PropertyGroup.OrbitCordVersion
if ([string]::IsNullOrWhiteSpace($version)) { throw 'OrbitCordVersion is missing.' }

if (-not $SkipTests) {
    & (Join-Path $PSScriptRoot 'Test-OrbitCord.ps1') -Configuration Release
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
} else {
    & dotnet restore OrbitCord.sln
    if ($LASTEXITCODE -ne 0) { throw 'dotnet restore failed' }
}

$artifactRoot = Join-Path $root 'artifacts'
$output = Join-Path $artifactRoot "OrbitCord-$version-win-x64"
$zip = Join-Path $artifactRoot 'OrbitCord-win-x64.zip'
Remove-Item $output -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item $zip -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $artifactRoot -Force | Out-Null

$selfContainedValue = if ($SelfContained) { 'true' } else { 'false' }
Write-Host "Publishing OrbitCord $version (self-contained: $selfContainedValue)..." -ForegroundColor Cyan
& dotnet publish src/OrbitCord.App/OrbitCord.App.csproj `
    -c Release `
    -r win-x64 `
    --self-contained $selfContainedValue `
    --no-restore `
    -o $output
if ($LASTEXITCODE -ne 0) { throw 'dotnet publish failed' }

Compress-Archive -Path (Join-Path $output '*') -DestinationPath $zip -Force
$hash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -Path "$zip.sha256" -Value "$hash  OrbitCord-win-x64.zip" -Encoding ascii

Write-Host "Build: $output" -ForegroundColor Green
Write-Host "ZIP:   $zip" -ForegroundColor Green
Write-Host "SHA256 $hash" -ForegroundColor Green
