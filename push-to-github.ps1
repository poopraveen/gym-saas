# Push gym-saas to GitHub
# Run this AFTER: 1) Git is installed, 2) You created a repo on github.com
# Replace YOUR_USERNAME and YOUR_REPO_NAME below

$repoUrl = "https://github.com/poopraveen/gym-saas.git"

Set-Location $PSScriptRoot

if (-not (Test-Path .git)) {
    git init
    git branch -M main
}
git add .
git status
git commit -m "Initial commit - Gym SaaS app"
git remote remove origin 2>$null
git remote add origin $repoUrl
Write-Host ""
Write-Host "Next step: Run 'git push -u origin main'" -ForegroundColor Yellow
Write-Host "GitHub will prompt for your username and password/token." -ForegroundColor Yellow
