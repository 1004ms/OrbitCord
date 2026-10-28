[CmdletBinding()]
param(
    [switch]$StableOnly,
    [switch]$NoLaunch,
    [string]$Repository = '1004ms/OrbitCord'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$repo = $Repository
if ([string]::IsNullOrWhiteSpace($repo) -or $repo -eq '1004ms/OrbitCord') {
    throw 'Repository is not configured. Run BOOTSTRAP-GITHUB.ps1 before publishing OrbitCord.'
}
$uri = "https://raw.githubusercontent.com/$repo/main/install.ps1"
$installerSource = (Invoke-WebRequest -UseBasicParsing -Uri $uri).Content
$installer = [scriptblock]::Create($installerSource)
& $installer -UpdateOnly -StableOnly:$StableOnly -NoLaunch:$NoLaunch -Repository $repo
