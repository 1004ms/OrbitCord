[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

& (Join-Path $PSScriptRoot 'Test-OrbitCord.ps1') -Configuration Debug
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

& dotnet run --project src/OrbitCord.App/OrbitCord.App.csproj -c Debug --no-restore
exit $LASTEXITCODE
