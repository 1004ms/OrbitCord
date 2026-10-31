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
$buildArtifactPaths = @(
    'src/OrbitCord.Core/bin',
    'src/OrbitCord.Core/obj',
    'src/OrbitCord.App/bin',
    'src/OrbitCord.App/obj',
    'src/OrbitCord.Installer/bin',
    'src/OrbitCord.Installer/obj',
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

Write-Host '[3/6] Build installer' -ForegroundColor Cyan
& dotnet build src/OrbitCord.Installer/OrbitCord.Installer.csproj -c $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { throw 'OrbitCord.Installer build failed' }

Write-Host '[4/6] .NET tests' -ForegroundColor Cyan
& dotnet test OrbitCord.sln -c $Configuration --no-restore
if ($LASTEXITCODE -ne 0) { throw 'dotnet test failed' }

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
