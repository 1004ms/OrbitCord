[CmdletBinding()]
param(
    [string]$Repository,
    [switch]$SkipInitialRelease
)

$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot


function Invoke-NativeProbe {
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [Parameter(Mandatory = $true)][string[]]$Arguments
    )

    $previousErrorActionPreference = $ErrorActionPreference
    try {
        # Windows PowerShell 5.1 can promote native stderr to NativeCommandError when
        # ErrorActionPreference is Stop. These probes are allowed to return non-zero.
        $ErrorActionPreference = 'Continue'
        & $FilePath @Arguments *> $null
        return $LASTEXITCODE -eq 0
    }
    catch {
        return $false
    }
    finally {
        $ErrorActionPreference = $previousErrorActionPreference
    }
}


foreach ($command in 'git','gh','dotnet','node') {
    if (-not (Get-Command $command -ErrorAction SilentlyContinue)) {
        throw "$command is required. Install Git and GitHub CLI first."
    }
}
& gh auth status
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated. Run: gh auth login' }

if ([string]::IsNullOrWhiteSpace($Repository)) {
    $login = (& gh api user --jq '.login').Trim()
    if (-not $login) { throw 'Could not determine the authenticated GitHub account.' }
    $Repository = "$login/OrbitCord"
}
if ($Repository -notmatch '^[^/\s]+/[^/\s]+$') {
    throw "Repository must be in owner/name form, got '$Repository'."
}

# Bind the generic public-source placeholder to the repository selected for publication.
$placeholder = '__ORBITCORD_REPOSITORY__'
$bindingFiles = @(
    'Directory.Build.props',
    'install.ps1',
    'update.ps1',
    'README.md'
)
foreach ($relativePath in $bindingFiles) {
    $path = Join-Path $PSScriptRoot $relativePath
    if (-not (Test-Path $path)) { continue }
    $content = Get-Content $path -Raw
    if ($content.Contains($placeholder)) {
        $content = $content.Replace($placeholder, $Repository)
        Set-Content -Path $path -Value $content -NoNewline -Encoding utf8
    }
}

Write-Host 'Running the complete OrbitCord test suite before the first public push...' -ForegroundColor Cyan
& (Join-Path $PSScriptRoot 'scripts\Test-OrbitCord.ps1') -Configuration Release
if ($LASTEXITCODE -ne 0) { throw 'Tests failed. Repository creation aborted.' }

if (-not (Test-Path '.git')) {
    & git init -b main
    if ($LASTEXITCODE -ne 0) { throw 'git init failed' }
}

$currentBranch = (& git branch --show-current).Trim()
if ($currentBranch -and $currentBranch -ne 'main') {
    & git branch -M main
    if ($LASTEXITCODE -ne 0) { throw 'could not rename current branch to main' }
}

$gitName = (& git config --get user.name 2>$null)
$gitEmail = (& git config --get user.email 2>$null)
if (-not $gitName -or -not $gitEmail) {
    $profile = (& gh api user) | ConvertFrom-Json
    if (-not $gitName) { & git config user.name ([string]$profile.login) }
    if (-not $gitEmail) { & git config user.email ("$($profile.id)+$($profile.login)@users.noreply.github.com") }
}

& git add --all
$hasHead = Invoke-NativeProbe -FilePath 'git' -Arguments @('show-ref','--head','--verify','--quiet','HEAD')
if (-not $hasHead) {
    & git commit -m 'chore: publish OrbitCord source'
    if ($LASTEXITCODE -ne 0) { throw 'initial git commit failed' }
}

$repoExists = Invoke-NativeProbe -FilePath 'gh' -Arguments @('repo','view',$Repository,'--json','name')
if (-not $repoExists) {
    Write-Host "Creating public repository $Repository..." -ForegroundColor Cyan
    & gh repo create $Repository --public --source . --remote origin --push --description 'Lightweight Discord Web client for Windows built with .NET WPF and WebView2.'
    if ($LASTEXITCODE -ne 0) { throw 'gh repo create failed' }
} else {
    $remotes = @(& git remote)
    if ($remotes -notcontains 'origin') {
        & git remote add origin "https://github.com/$Repository.git"
        if ($LASTEXITCODE -ne 0) { throw 'could not add origin remote' }
    }
    & git push -u origin main
    if ($LASTEXITCODE -ne 0) { throw 'git push failed' }
}

& gh repo edit $Repository --enable-issues=true --enable-wiki=false

if (-not $SkipInitialRelease) {
    [xml]$props = Get-Content 'Directory.Build.props'
    $version = [string]$props.Project.PropertyGroup.OrbitCordVersion
    $tag = "v$version"
    $tagExists = Invoke-NativeProbe -FilePath 'git' -Arguments @('show-ref','--tags','--verify','--quiet',"refs/tags/$tag")
    if (-not $tagExists) {
        & git tag -a $tag -m "OrbitCord $version"
    }
    & git push origin $tag
    if ($LASTEXITCODE -ne 0) { throw 'initial release tag push failed' }
    Write-Host "Initial release queued: $tag" -ForegroundColor Green
}

Write-Host "Repository ready: https://github.com/$Repository" -ForegroundColor Green
