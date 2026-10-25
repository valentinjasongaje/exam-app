# ECE Video Opener - opens a review video from an "ecevideo:" link on the exam app.
#
# Installed by "Install video opener.bat" (same folder). The website sends
#   ecevideo:open?path=<path relative to this drive, URL-encoded>
# and this script opens that file in the default video player.
#
# Safety: it only opens existing .mp4 files inside "Excel Review Center" or
# "REVIEW TUTORIAL" on the drive this script lives on. Anything else is refused.
param([string]$Url)

Add-Type -AssemblyName System.Windows.Forms
function Fail([string]$msg) {
  [System.Windows.Forms.MessageBox]::Show($msg, 'ECE Video Opener', 'OK', 'Warning') | Out-Null
  exit 1
}

$allowed = @('Excel Review Center', 'REVIEW TUTORIAL')
$root = (Split-Path -Qualifier $PSScriptRoot) + '\'

if (-not $Url -or $Url -notmatch '^ecevideo:') { Fail 'This only opens links from the exam app.' }
$query = ($Url -split '\?', 2)[1]
if (-not $query) { Fail 'The link has no video in it.' }

$rel = $null
foreach ($pair in $query -split '&') {
  $kv = $pair -split '=', 2
  if ($kv[0] -eq 'path' -and $kv.Count -eq 2) { $rel = [System.Uri]::UnescapeDataString($kv[1].Replace('+', ' ')) }
}
if (-not $rel) { Fail 'The link has no video in it.' }

$rel = $rel.Replace('/', '\').TrimStart('\')
$top = ($rel -split '\\', 2)[0]
if ($rel -match '\.\.' -or $rel -match ':' -or $allowed -notcontains $top -or [System.IO.Path]::GetExtension($rel) -ne '.mp4') {
  Fail "Refused to open:`n$rel`n`nOnly .mp4 files inside the review folders can be opened."
}

$full = Join-Path $root $rel
if (-not (Test-Path -LiteralPath $full -PathType Leaf)) {
  Fail "Couldn't find this video:`n$full`n`nIs the review drive plugged in as $root ?"
}

Invoke-Item -LiteralPath $full
