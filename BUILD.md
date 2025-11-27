# Build Instructions for Chrome Web Store

## Quick Build

### Windows (PowerShell)
```powershell
# Navigate to project root
cd C:\Users\YiranYe'spowerstatio\Documents\LegalGuard

# Create ZIP from extension folder contents
Compress-Archive -Path extension\* -DestinationPath LegalGuard-v1.0.zip -Force
```

### Windows (Command Prompt)
```cmd
cd C:\Users\YiranYe'spowerstatio\Documents\LegalGuard
cd extension
tar -a -c -f ..\LegalGuard-v1.0.zip *
cd ..
```

### Mac/Linux
```bash
cd extension
zip -r ../LegalGuard-v1.0.zip .
cd ..
```

## Verify ZIP Contents

After creating the ZIP, verify it contains:
- ✅ `manifest.json` at the root
- ✅ All JavaScript files (background.js, sidepanel.js, etc.)
- ✅ All HTML files (sidepanel.html, popup.html)
- ✅ `icons/` folder with all icon files
- ✅ `css/` folder with toast.css
- ✅ JSON files (glossary_tri.json, glossary_multilingual.json)
- ✅ marked.min.js

**Important:** The ZIP should NOT contain an `extension/` folder wrapper. The contents should be at the root of the ZIP.

## File Size Check

Chrome Web Store has a 10MB limit for the initial upload. Check your ZIP size:
- Windows: Right-click ZIP → Properties
- Mac/Linux: `ls -lh LegalGuard-v1.0.zip`

If your ZIP is too large:
- Check for unnecessary files
- Optimize images if needed
- Remove any test files or development artifacts

## Testing Before Submission

1. **Load the extension locally:**
   - Go to `chrome://extensions/`
   - Enable "Developer mode"
   - Click "Load unpacked"
   - Select the `extension/` folder
   - Test all features

2. **Test the ZIP:**
   - Extract the ZIP to a temporary folder
   - Load it as an unpacked extension
   - Verify everything works

3. **Check for errors:**
   - Open Chrome DevTools
   - Check Console for errors
   - Test on multiple websites
   - Verify all permissions work

## Ready for Submission

Once the ZIP is created and tested:
1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Click "New Item"
3. Upload `LegalGuard-v1.0.zip`
4. Follow the submission process in `STORE_SUBMISSION.md`


