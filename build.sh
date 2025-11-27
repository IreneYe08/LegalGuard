#!/bin/bash
# Build script for Chrome Web Store submission
# Usage: ./build.sh

VERSION="5.0"
ZIP_NAME="LegalGuard-v${VERSION}.zip"
EXTENSION_PATH="extension"

echo "Building LegalGuard extension for Chrome Web Store..."

# Check if extension folder exists
if [ ! -d "$EXTENSION_PATH" ]; then
    echo "Error: $EXTENSION_PATH folder not found!"
    exit 1
fi

# Remove old ZIP if exists
if [ -f "$ZIP_NAME" ]; then
    echo "Removing old $ZIP_NAME..."
    rm -f "$ZIP_NAME"
fi

# Create ZIP from extension folder contents
echo "Creating $ZIP_NAME from $EXTENSION_PATH..."
cd "$EXTENSION_PATH"
zip -r "../$ZIP_NAME" . -q
cd ..

# Check if ZIP was created successfully
if [ -f "$ZIP_NAME" ]; then
    ZIP_SIZE=$(du -h "$ZIP_NAME" | cut -f1)
    echo ""
    echo "✅ Success! Created $ZIP_NAME"
    echo "   Size: $ZIP_SIZE"
    echo ""
    echo "Next steps:"
    echo "1. Go to https://chrome.google.com/webstore/devconsole"
    echo "2. Click 'New Item' and upload $ZIP_NAME"
    echo "3. Follow the guide in STORE_SUBMISSION.md"
else
    echo ""
    echo "❌ Error: Failed to create ZIP file!"
    exit 1
fi


