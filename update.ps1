[CmdletBinding()]
param(
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

# Keep one deployment engine: update.ps1 always downloads the current install.ps1
# from main, then install.ps1 resolves GitHub /releases/latest and performs the
# SHA256-verified update with rollback.
$uri = "https://raw.githubusercontent.com/$repo/main/install.ps1"
$installerSource = ((Invoke-WebRequest -UseBasicParsing -Uri $uri).Content).TrimStart([char]0xFEFF)
$installer = [scriptblock]::Create($installerSource)
& $installer -UpdateOnly -NoLaunch:$NoLaunch -Repository $repo
