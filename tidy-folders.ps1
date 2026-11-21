# tidy-folders.ps1 - run from the project root.
#   .\tidy-folders.ps1            shows what it WOULD do (changes nothing)
#   .\tidy-folders.ps1 -Apply    does it
# Nothing is deleted. Anything replaced or removed is moved into _old\ so you can put it back.
param([switch]$Apply)
$ErrorActionPreference = 'Stop'
if (-not ((Test-Path backend) -and (Test-Path frontend))) { throw 'Run this from the project root (the folder that holds backend and frontend).' }
$old = '_old'
function Say($m) { Write-Host $m }
function Park($path) {            # move a file/folder into _old, keeping its path
  if (-not (Test-Path $path)) { return }
  $dest = Join-Path $old $path
  Say "  park   $path  ->  $dest"
  if ($Apply) { New-Item -ItemType Directory -Force -Path (Split-Path $dest) | Out-Null; Move-Item -LiteralPath $path -Destination $dest -Force }
}

Say '1. Apps Script files: one home, backend\'
if (Test-Path apps-script) {
  @(Get-ChildItem apps-script -File) | ForEach-Object {
    $target = Join-Path backend $_.Name
    if (Test-Path $target) {
      if ((Get-FileHash $_.FullName).Hash -eq (Get-FileHash $target).Hash) { Say "  same   $($_.Name) (already in backend)"; Park $_.FullName.Substring((Get-Location).Path.Length + 1) }
      else {
        Say "  update backend\$($_.Name) from apps-script (old copy kept in _old\backend)"
        if ($Apply) { New-Item -ItemType Directory -Force -Path "$old\backend" | Out-Null; Copy-Item $target "$old\backend\$($_.Name)" -Force; Copy-Item $_.FullName $target -Force }
        Park ("apps-script\" + $_.Name)
      }
    } else {
      Say "  move   $($_.Name) -> backend\"
      if ($Apply) { Move-Item $_.FullName $target }
    }
  }
  if ($Apply -and -not (Get-ChildItem apps-script -Force)) { Remove-Item apps-script }
}

Say '2. Stray files inside frontend\'
@(Get-ChildItem frontend -File -Filter *.gs) | ForEach-Object { Park ("frontend\" + $_.Name) }
Park 'frontend\frontend'

Say '3. Leftover folders at the top level (the site is served from frontend\)'
foreach ($p in 'api', 'css', 'arx', 'script.js') { Park $p }
foreach ($p in 'adv', 'fol', 'choose', 'sem', 'js', '_tmp') {
  if ((Test-Path $p) -and -not (Get-ChildItem $p -Force -Recurse -File)) { Say "  empty  $p (removing)"; if ($Apply) { Remove-Item $p -Recurse } }
}

if ($Apply) { Say "`nDone. Run your tests, check localhost, then commit. If something is missing, look in _old\ and move it back." }
else { Say "`nDry run only. Nothing changed. Run again with -Apply to do it." }
