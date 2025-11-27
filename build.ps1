# Build script for Chrome Web Store submission
# Usage: .\build.ps1

$version = "5.0"
$zipName = "LegalGuard-v$version.zip"
$extensionPath = "extension"

Write-Host "Building LegalGuard extension for Chrome Web Store..." -ForegroundColor Green

# Check if extension folder exists
if (-not (Test-Path $extensionPath)) {
    Write-Host "Error: $extensionPath folder not found!" -ForegroundColor Red
    exit 1
}

# Remove old ZIP if exists
if (Test-Path $zipName) {
    Write-Host "Removing old $zipName..." -ForegroundColor Yellow
    Remove-Item $zipName -Force
}

# Create ZIP from extension folder contents
Write-Host "Creating $zipName from $extensionPath..." -ForegroundColor Cyan
Compress-Archive -Path "$extensionPath\*" -DestinationPath $zipName -Force

# Check if ZIP was created successfully
if (Test-Path $zipName) {
    $zipSize = (Get-Item $zipName).Length / 1MB
    Write-Host "`n✅ Success! Created $zipName" -ForegroundColor Green
    Write-Host "   Size: $([math]::Round($zipSize, 2)) MB" -ForegroundColor Cyan
    
    if ($zipSize -gt 10) {
        Write-Host "   ⚠️  Warning: ZIP size exceeds 10MB limit!" -ForegroundColor Yellow
    } else {
        Write-Host "   ✓ ZIP size is within Chrome Web Store limits" -ForegroundColor Green
    }
    
    Write-Host "`nNext steps:" -ForegroundColor Yellow
    Write-Host "1. Go to https://chrome.google.com/webstore/devconsole" -ForegroundColor White
    Write-Host "2. Click 'New Item' and upload $zipName" -ForegroundColor White
    Write-Host "3. Follow the guide in STORE_SUBMISSION.md" -ForegroundColor White
} else {
    Write-Host "`n❌ Error: Failed to create ZIP file!" -ForegroundColor Red
    exit 1
}


