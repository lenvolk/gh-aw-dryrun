<#
.SYNOPSIS
  Deploy the Java modernization template from the Software Factory to a nominated catalog repository.

.DESCRIPTION
  The Software Factory (this repository) holds the template. The workflows run in the target repository.
  This script, run by the Copilot agent when you click Deploy or Update template in the Software Factory canvas:

    1. Checks the tools and that the target is nominated in templates\catalog.json.
    2. Uses the target's local checkout (catalog localPath), or clones it when the folder is missing.
    3. Copies the template files into the target's .github folder.
       Deploy copies only missing files. -Update also overwrites files that differ from the template.
    4. Configures the target: Issues, Actions, pull request permission, labels, the assessment-review
       approval environment (you are the required reviewer), and the runner price variable.
    5. Compiles the agent workflows in the target with gh aw compile.
    6. Reports what changed. With -Push it commits the .github changes and pushes them to main.

  It never reads or prints the Copilot token; the canvas stores that secret directly.

.PARAMETER Repo
  owner/name of the target, as listed in templates\catalog.json.

.PARAMETER Update
  Also overwrite target files that differ from the template.

.PARAMETER Push
  Commit and push the .github changes to main of the target. The agent passes it only after you confirm.

.PARAMETER CheckOnly
  Report only. Copies nothing, changes nothing on GitHub, does not compile.

.EXAMPLE
  .\templates\JavaModernization\deploy.ps1 -Repo lenvolk/java-migration-copilot-samples -CheckOnly
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)][string]$Repo,
  [switch]$Update,
  [switch]$Push,
  [switch]$CheckOnly
)

$ErrorActionPreference = 'Stop'
$MinAwVersion = [version]'0.89.21'
$TemplateId = 'java-modernization'
$TemplateRoot = $PSScriptRoot
$FactoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$results = New-Object System.Collections.Generic.List[object]

function Add-Result($Step, $Status, $Detail) {
  $results.Add([pscustomobject]@{ Step = $Step; Status = $Status; Detail = $Detail }) | Out-Null
  $color = switch ($Status) { 'OK' { 'Green' } { $_ -in 'FIXED', 'ADDED', 'UPDATED' } { 'Cyan' } { $_ -in 'MANUAL', 'DIFFERS', 'PENDING' } { 'Yellow' } default { 'Red' } }
  Write-Host ("[{0}] {1} - {2}" -f $Status, $Step, $Detail) -ForegroundColor $color
}

function Write-Summary($Outcome) {
  Write-Host ''
  Write-Host '=== Summary ===' -ForegroundColor White
  $results | Format-Table -AutoSize | Out-String -Width 220 | Write-Host
  # One machine-readable line for the canvas and the agent.
  $summary = [ordered]@{ repo = $Repo; outcome = $Outcome; update = [bool]$Update; push = [bool]$Push; checkOnly = [bool]$CheckOnly; results = $results }
  Write-Host ('FACTORY-RESULT: ' + ($summary | ConvertTo-Json -Depth 5 -Compress))
}

function Stop-Deploy($Message) {
  Add-Result 'Stopped' 'FAIL' $Message
  Write-Summary 'failed'
  exit 1
}

# Native commands may write to stderr; that must not abort the script in Windows PowerShell 5.1.
function Invoke-Native($ScriptBlock) {
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try { $output = & $ScriptBlock 2>&1 | ForEach-Object { "$_" } | Out-String } finally { $ErrorActionPreference = $previous }
  return [pscustomobject]@{ Ok = ($LASTEXITCODE -eq 0); Output = $output }
}

function Get-Normalized($Path) {
  # Compare content, not line endings: Windows checkouts often use CRLF.
  return ([IO.File]::ReadAllText($Path)) -replace "`r`n", "`n"
}

# 1. Catalog: only nominated repositories may use factory minutes and AI credits
$catalogPath = Join-Path $FactoryRoot 'templates\catalog.json'
$catalog = Get-Content $catalogPath -Raw | ConvertFrom-Json
$entry = $catalog.repositories | Where-Object { $_.repo -eq $Repo }
if (-not $entry) { Stop-Deploy "$Repo is not in templates\catalog.json." }
if (-not $entry.nominated) { Stop-Deploy "$Repo is in the catalog but not nominated. The factory does not spend Actions minutes or AI credits on it." }
if ($entry.template -ne $TemplateId) { Stop-Deploy "$Repo uses template '$($entry.template)', not '$TemplateId'." }
Add-Result 'Catalog' 'OK' "$Repo is nominated for $TemplateId"

# 2. Tools
foreach ($tool in 'git', 'gh') {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Stop-Deploy "$tool is not installed." }
}
if (-not (Invoke-Native { gh auth status }).Ok) { Stop-Deploy 'GitHub CLI is not signed in. Run: gh auth login' }
$awOut = (Invoke-Native { gh aw version }).Output
if ($awOut -notmatch 'v?(\d+\.\d+\.\d+)') { Stop-Deploy 'gh-aw is not installed. Run: gh extension install github/gh-aw' }
$awVersion = [version]$Matches[1]
if ($awVersion -lt $MinAwVersion) { Stop-Deploy "gh-aw $awVersion is older than $MinAwVersion. See plan.md, SAML fallback for gh-aw." }
Add-Result 'Tools' 'OK' "git, gh signed in, gh-aw v$awVersion"

# 3. Target repository on GitHub, never its upstream. REST, not `gh repo view --json parent`: reading the parent
#    can fail on SAML enforcement of the upstream organization.
$info = (Invoke-Native { gh api "repos/$Repo" --jq '{full_name, has_issues, visibility, default_branch}' })
if (-not $info.Ok) { Stop-Deploy "Cannot read $Repo on GitHub: $($info.Output)" }
$info = $info.Output | ConvertFrom-Json
if ($entry.upstream -and $info.full_name -eq $entry.upstream) { Stop-Deploy "$Repo resolves to the upstream repository $($entry.upstream)." }
$defaultBranch = $info.default_branch
Add-Result 'Target repository' 'OK' ("{0}, {1}, default branch {2}" -f $info.full_name, $info.visibility, $defaultBranch)

# 4. Local checkout of the target: catalog localPath, cloned when missing
$localPath = $entry.localPath
if (-not $localPath) { $localPath = Join-Path $FactoryRoot (".factory-work\" + ($Repo -replace '/', '__')) }
if (-not (Test-Path (Join-Path $localPath '.git'))) {
  if ($CheckOnly) { Stop-Deploy "No checkout at $localPath. Run Deploy without CheckOnly to clone it." }
  New-Item -ItemType Directory -Force (Split-Path $localPath) | Out-Null
  $r = Invoke-Native { gh repo clone $Repo $localPath }
  if (-not $r.Ok) { Stop-Deploy "Could not clone $Repo into $localPath. $($r.Output)" }
  Add-Result 'Local checkout' 'FIXED' "cloned into $localPath"
}
Set-Location $localPath
$originUrl = git remote get-url origin
if ($originUrl -notmatch 'github\.com[:/](?<owner>[^/]+)/(?<name>[^/]+?)(\.git)?$' -or "$($Matches.owner)/$($Matches.name)" -ne $Repo) {
  Stop-Deploy "origin of $localPath is $originUrl, not $Repo."
}
# Two remotes (origin and upstream) make gh ask "Select a repo". Pin the default to the target (local setting only).
Invoke-Native { gh repo set-default $Repo } | Out-Null
$branch = git branch --show-current
if ($branch -ne $defaultBranch) { Stop-Deploy "Switch $localPath to $defaultBranch first (current branch: $branch)." }
if (-not $CheckOnly) {
  $pull = Invoke-Native { git pull --ff-only --quiet origin $defaultBranch }
  if (-not $pull.Ok) { Stop-Deploy "git pull failed in ${localPath}: $($pull.Output)" }
}
Add-Result 'Local checkout' 'OK' "$localPath on $defaultBranch"

# 5. Template files: copy missing; with -Update also overwrite files that differ
$templateFiles = Get-ChildItem (Join-Path $TemplateRoot '.github') -Recurse -File | Where-Object { $_.FullName -notmatch '\\__pycache__\\|\.pyc$' }
$added = @(); $updated = @(); $differs = @(); $present = 0
foreach ($file in $templateFiles) {
  $relative = $file.FullName.Substring($TemplateRoot.Length + 1)
  $target = Join-Path $localPath $relative
  $shown = $relative -replace '\\', '/'
  if (-not (Test-Path $target)) {
    if (-not $CheckOnly) { New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null; Copy-Item $file.FullName $target -Force }
    $added += $shown
  }
  elseif ((Get-Normalized $file.FullName) -ne (Get-Normalized $target)) {
    if ($Update -and -not $CheckOnly) { Copy-Item $file.FullName $target -Force; $updated += $shown } else { $differs += $shown }
  }
  else { $present++ }
}
$verb = if ($CheckOnly) { 'to add' } else { 'added' }
Add-Result 'Template files' 'OK' "$($templateFiles.Count) in template, $present already identical"
if ($added) { Add-Result 'Missing files' 'ADDED' ("{0} {1}: {2}" -f $added.Count, $verb, ($added -join ', ')) }
if ($updated) { Add-Result 'Changed files' 'UPDATED' ("{0} overwritten from the template: {1}" -f $updated.Count, ($updated -join ', ')) }
if ($differs) {
  $hint = if ($Update) { 'CheckOnly: not overwritten' } else { 'kept as they are; use Update template to overwrite them' }
  Add-Result 'Changed files' 'DIFFERS' ("{0} differ from the template, {1}: {2}" -f $differs.Count, $hint, ($differs -join ', '))
}
if (-not $added -and -not $updated -and -not $differs) { Add-Result 'Template status' 'OK' 'up to date, nothing to copy' }

# 6. Repository settings (forks start with Issues and Actions turned off)
if ($CheckOnly) {
  Add-Result 'Issues' ($(if ($info.has_issues) { 'OK' } else { 'MANUAL' })) "enabled = $($info.has_issues)"
  $wf = (Invoke-Native { gh api "repos/$Repo/actions/permissions/workflow" }).Output | ConvertFrom-Json
  Add-Result 'Actions can create pull requests' ($(if ($wf.can_approve_pull_request_reviews) { 'OK' } else { 'MANUAL' })) "enabled = $($wf.can_approve_pull_request_reviews)"
}
else {
  if (-not $info.has_issues) { gh repo edit $Repo --enable-issues | Out-Null; Add-Result 'Issues' 'FIXED' 'enabled' }
  else { Add-Result 'Issues' 'OK' 'enabled' }
  $r = Invoke-Native { gh api -X PUT "repos/$Repo/actions/permissions" -F enabled=true -f allowed_actions=all }
  Add-Result 'Actions' ($(if ($r.Ok) { 'OK' } else { 'MANUAL' })) ($(if ($r.Ok) { 'enabled, all actions allowed' } else { 'Settings > Actions > General > Allow all actions' }))
  $r = Invoke-Native { gh api -X PUT "repos/$Repo/actions/permissions/workflow" -f default_workflow_permissions=read -F can_approve_pull_request_reviews=true }
  Add-Result 'Actions can create pull requests' ($(if ($r.Ok) { 'OK' } else { 'MANUAL' })) ($(if ($r.Ok) { 'enabled' } else { 'Settings > Actions > General > Workflow permissions' }))
  $labels = @(
    @{ n = 'modernization-request'; c = '5319e7' },
    @{ n = 'modernization'; c = '1d76db' },
    @{ n = 'ready-for-human-review'; c = '0e8a16' },
    @{ n = 'needs-attention'; c = 'd93f0b' }
  )
  foreach ($l in $labels) { gh label create $l.n --color $l.c --force --repo $Repo | Out-Null }
  Add-Result 'Labels' 'OK' (($labels | ForEach-Object { $_.n }) -join ', ')
  $rate = [string]$catalog.billing.actionsUsdPerMinute
  $r = Invoke-Native { gh variable set MODERNIZE_ACTIONS_USD_PER_MINUTE --body $rate --repo $Repo }
  Add-Result 'Runner price variable' ($(if ($r.Ok) { 'OK' } else { 'MANUAL' })) "MODERNIZE_ACTIONS_USD_PER_MINUTE = $rate USD"
}

# Gate 1: the assessment run pauses in this environment until a required reviewer approves
$gateName = 'assessment-review'
$gateRules = 0
$gate = Invoke-Native { gh api "repos/$Repo/environments/$gateName" --jq '[.protection_rules[]? | select(.type == "required_reviewers")] | length' }
if ($gate.Ok) { [void][int]::TryParse($gate.Output.Trim(), [ref]$gateRules) }
if ($gateRules -ge 1) { Add-Result 'Approval environment' 'OK' "$gateName requires a reviewer" }
elseif ($CheckOnly) { Add-Result 'Approval environment' 'MANUAL' "$gateName is missing or has no required reviewer. Run Deploy." }
else {
  $userId = [int](gh api user --jq .id)
  $payload = @{ reviewers = @(@{ type = 'User'; id = $userId }); prevent_self_review = $false } | ConvertTo-Json -Depth 5 -Compress
  $r = Invoke-Native { $payload | gh api -X PUT "repos/$Repo/environments/$gateName" --input - }
  if ($r.Ok) { Add-Result 'Approval environment' 'FIXED' "$gateName created, you are the required reviewer" }
  else { Add-Result 'Approval environment' 'MANUAL' "Settings > Environments > '$gateName' > Required reviewers: add yourself" }
}

# The Copilot token is set from the canvas, never by this script
$hasSecret = gh secret list --repo $Repo --json name | ConvertFrom-Json | Where-Object name -eq 'COPILOT_GITHUB_TOKEN'
Add-Result 'COPILOT_GITHUB_TOKEN' ($(if ($hasSecret) { 'OK' } else { 'MANUAL' })) ($(if ($hasSecret) { 'set' } else { 'not set: paste the token in the canvas and select Save token' }))

# 7. Compile the agent workflows in the target
$markdown = @(Get-ChildItem .github\workflows -Filter 'modernize-*.md')
if ($CheckOnly) {
  $locks = @(Get-ChildItem .github\workflows -Filter 'modernize-*.lock.yml')
  Add-Result 'Compiled workflows' ($(if ($locks.Count -ge $markdown.Count) { 'OK' } else { 'MANUAL' })) "$($locks.Count) lock files for $($markdown.Count) agent workflows"
}
else {
  $compile = Invoke-Native { gh aw compile }
  if (-not $compile.Ok) { Write-Host $compile.Output; Stop-Deploy 'gh aw compile failed. Fix the error above and run Deploy again.' }
  $locks = @(Get-ChildItem .github\workflows -Filter 'modernize-*.lock.yml')
  if ($locks.Count -lt $markdown.Count) { Stop-Deploy "Expected $($markdown.Count) compiled .lock.yml files, found $($locks.Count)." }
  Add-Result 'gh aw compile' 'OK' "$($locks.Count) lock files"
}

# 8. Stamp the deployed template version, then commit and push only with -Push
if ($CheckOnly) {
  $outcome = if ($added -or $differs) { 'changes-available' } else { 'up-to-date' }
  Write-Summary $outcome
  exit 0
}
$pending = @()
if (-not $CheckOnly) {
  $stampPath = '.github\factory.json'
  if ($added -or $updated -or -not (Test-Path $stampPath)) {
    $factoryCommit = (git -C $FactoryRoot rev-parse --short HEAD)
    $factoryRemote = git -C $FactoryRoot remote get-url origin
    $stamp = [ordered]@{
      factory = ($factoryRemote -replace '^https://github\.com/', '' -replace '\.git$', '')
      template = $TemplateId
      templateCommit = $factoryCommit
      deployedAt = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')
    }
    ($stamp | ConvertTo-Json) + "`n" | Set-Content -Path $stampPath -NoNewline -Encoding utf8
  }
  $pending = @(git status --porcelain -- .github ':(exclude).github/modernize')
}
if (-not $pending) {
  Add-Result 'Commit and push' 'OK' 'nothing to commit'
  Write-Summary 'up-to-date'
  exit 0
}
if (-not $Push) {
  Add-Result 'Commit and push' 'PENDING' ("{0} changed paths under .github wait for your confirmation. Run again with -Push." -f $pending.Count)
  $pending | ForEach-Object { Write-Host "  $_" }
  Write-Summary 'needs-push'
  exit 0
}
git add -- .github ':(exclude).github/modernize'
$message = if ($Update) { "chore(factory): update $TemplateId template from the Software Factory" } else { "chore(factory): deploy $TemplateId template from the Software Factory" }
git commit -m $message | Out-Null
$push = Invoke-Native { git push origin $defaultBranch }
if (-not $push.Ok) { Stop-Deploy "git push failed: $($push.Output)" }
Add-Result 'Commit and push' 'FIXED' "pushed to origin/$defaultBranch"

Start-Sleep -Seconds 5
$names = gh workflow list --repo $Repo --json name | ConvertFrom-Json | ForEach-Object { $_.name }
$expected = @('modernize-assessment', 'modernize-pipeline') + ($markdown | ForEach-Object { $_.BaseName })
$missing = $expected | Where-Object { $names -notcontains $_ }
if ($missing) { Add-Result 'Workflows registered' 'MANUAL' "not visible yet: $($missing -join ', '). Wait a minute and refresh the canvas." }
else { Add-Result 'Workflows registered' 'OK' "all $($expected.Count) modernize-* workflows visible in Actions" }
Write-Summary 'pushed'
