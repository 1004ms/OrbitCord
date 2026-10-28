[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$')]
    [string]$Version
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$propsPath = Join-Path $root 'Directory.Build.props'
$content = Get-Content $propsPath -Raw

$baseVersion = ($Version -split '-', 2)[0]
$parts = $baseVersion.Split('.')
if ($parts.Count -ne 3) { throw 'Version must use major.minor.patch.' }

$build = 0
if ($Version.Contains('-')) {
    $matches = [regex]::Matches(($Version -split '-', 2)[1], '\d+')
    if ($matches.Count -gt 0) {
        $build = [int]$matches[$matches.Count - 1].Value
    }
}
if ($build -gt 65535) { throw 'Prerelease numeric component is too large for FileVersion.' }
$fileVersion = "$($parts[0]).$($parts[1]).$($parts[2]).$build"
$assemblyVersion = "$($parts[0]).$($parts[1]).$($parts[2]).0"

$content = [regex]::Replace($content, '<OrbitCordVersion>[^<]+</OrbitCordVersion>', "<OrbitCordVersion>$Version</OrbitCordVersion>")
$content = [regex]::Replace($content, '<FileVersion>[^<]+</FileVersion>', "<FileVersion>$fileVersion</FileVersion>")
$content = [regex]::Replace($content, '<AssemblyVersion>[^<]+</AssemblyVersion>', "<AssemblyVersion>$assemblyVersion</AssemblyVersion>")
[IO.File]::WriteAllText($propsPath, $content, [Text.UTF8Encoding]::new($false))

Write-Host "Version set to $Version" -ForegroundColor Green
Write-Host "FileVersion set to $fileVersion" -ForegroundColor Green
