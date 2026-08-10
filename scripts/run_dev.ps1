# ServiGo development-server launcher.
# Starts the dev server on 127.0.0.1:8000 using the project venv (required —
# global interpreters may have the wrong Django version).
#
# Usage:
#   .\scripts\run_dev.ps1            # 127.0.0.1:8000
#   .\scripts\run_dev.ps1 8010       # 127.0.0.1:8010
param([int]$Port = 8000)

$ProjectRoot = Split-Path -Parent $PSScriptRoot
$Python = Join-Path $ProjectRoot "venv\Scripts\python.exe"

if (-not (Test-Path $Python)) {
    Write-Error "venv not found at $Python. Run: python -m venv venv; pip install -r requirements.txt"
    exit 1
}

Set-Location $ProjectRoot
Write-Host "ServiGo dev server -> http://127.0.0.1:$Port  (Ctrl+C to stop)"
& $Python manage.py runserver "127.0.0.1:$Port"
