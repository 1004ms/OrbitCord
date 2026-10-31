[CmdletBinding()]
param(
    [ValidateSet('Debug','Release')]
    [string]$Configuration = 'Release'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

function Require-Command([string]$Name, [string]$Hint) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "$Name was not found. $Hint"
    }
}

Require-Command dotnet 'Install .NET 10 SDK.'
Require-Command node 'Install Node.js 20 or newer.'

$sdks = & dotnet --list-sdks
if (-not ($sdks -match '^10\.')) {
    throw '.NET 10 SDK is required.'
}

Write-Host '[0/6] Clean stale build artifacts' -ForegroundColor Cyan

# 1.1.7 retired the graphical Setup project. Source ZIPs are commonly extracted over an
# existing checkout, which does not delete files that disappeared from the new archive.
# Purge the retired project/tests here before any build/test discovery so an overlay upgrade
# cannot resurrect the old installer or execute obsolete installer contracts.
$retiredPaths = @(
    'src/OrbitCord.Installer',
    'tests/static/gui-installer-contract.test.mjs',
    'tests/static/gui-installer-full-wiring.test.mjs',
    'tests/static/gui-installer-layout-polish.test.mjs',
    'tests/static/gui-installer-minimal-ui.test.mjs',
    'tests/static/gui-installer-pixel-ui.test.mjs',
    'tests/static/gui-installer-real-art-assets.test.mjs',
    'tests/static/gui-installer-xaml-property-safety.test.mjs',
    'tests/static/gui-installer-xaml-wiring.test.mjs',
    'tests/static/installer-custom-desktop-detection.test.mjs',
    'tests/static/installer-custom-shortcut-preservation.test.mjs',
    'tests/static/installer-fresh-shortcut-repair.test.mjs',
    'tests/static/installer-live-update-contract.test.mjs',
    'tests/static/installer-v4-shortcut-recovery.test.mjs'
)
foreach ($relativePath in $retiredPaths) {
    $retiredPath = Join-Path $root $relativePath
    if (Test-Path $retiredPath) {
        Remove-Item $retiredPath -Recurse -Force
    }
}

$buildArtifactPaths = @(
    'src/OrbitCord.Core/bin',
    'src/OrbitCord.Core/obj',
    'src/OrbitCord.App/bin',
    'src/OrbitCord.App/obj',
    'tests/OrbitCord.Core.Tests/bin',
    'tests/OrbitCord.Core.Tests/obj'
)
foreach ($relativePath in $buildArtifactPaths) {
    $artifactPath = Join-Path $root $relativePath
    if (Test-Path $artifactPath) {
        Remove-Item $artifactPath -Recurse -Force
    }
}

Write-Host '[1/6] Restore' -ForegroundColor Cyan
& dotnet restore OrbitCord.sln
if ($LASTEXITCODE -ne 0) { throw 'dotnet restore failed' }

Write-Host '[2/6] Build app' -ForegroundColor Cyan
& dotnet build src/OrbitCord.App/OrbitCord.App.csproj -c $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { throw 'OrbitCord.App build failed' }

Write-Host '[3/6] .NET tests' -ForegroundColor Cyan
& dotnet test OrbitCord.sln -c $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { throw 'dotnet test failed' }

Write-Host '[4/6] PowerShell syntax' -ForegroundColor Cyan
foreach ($relativeScript in @('install.ps1','update.ps1','uninstall.ps1','PUBLISH-UPDATE.ps1')) {
    $scriptPath = Join-Path $root $relativeScript
    $tokens = $null
    $parseErrors = $null
    [System.Management.Automation.Language.Parser]::ParseFile(
        $scriptPath,
        [ref]$tokens,
        [ref]$parseErrors
    ) | Out-Null

    if ($parseErrors.Count -gt 0) {
        $details = ($parseErrors | ForEach-Object { "line $($_.Extent.StartLineNumber): $($_.Message)" }) -join '; '
        throw "PowerShell parse failed for ${relativeScript}: $details"
    }
}

Write-Host '[5/6] Web/static tests' -ForegroundColor Cyan
$tests = @(
    Get-ChildItem tests/js/*.test.mjs -File | Sort-Object Name
    Get-ChildItem tests/static/*.test.mjs -File | Sort-Object Name
)
foreach ($test in $tests) {
    & node $test.FullName
    if ($LASTEXITCODE -ne 0) { throw "Node test failed: $($test.FullName)" }
}

Write-Host '[6/6] Complete' -ForegroundColor Cyan
Write-Host "All OrbitCord tests passed ($($tests.Count) Node tests)." -ForegroundColor Green
