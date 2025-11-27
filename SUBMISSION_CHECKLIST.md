# Chrome Web Store Submission Checklist

Use this checklist to ensure your extension is ready for submission.

## ✅ Pre-Submission Checklist

### Code & Files
- [x] `manifest.json` includes `description` field
- [x] All required icons present (16, 32, 48, 128)
- [x] All file paths are correct and relative
- [x] No hardcoded absolute paths
- [x] No console errors in development
- [x] Extension tested in Chrome 126+
- [x] All features work as expected

### Testing
- [ ] Tested on multiple websites
- [ ] Toast notifications appear correctly
- [ ] Side panel opens and functions properly
- [ ] Context menu "Explain" option works
- [ ] Keyboard shortcut (Alt+L) works
- [ ] AI model download works (if applicable)
- [ ] Translation feature works
- [ ] Mute functionality works
- [ ] No errors in Chrome DevTools console

### Store Listing Assets
- [ ] **Small Promotional Tile** (440x280px) - Created
- [ ] **Large Promotional Tile** (920x680px) - Created
- [ ] **Screenshots** (at least 1, recommended 3-5):
  - [ ] Screenshot 1: Toast notification
  - [ ] Screenshot 2: Side panel with analysis
  - [ ] Screenshot 3: Q&A interface
  - [ ] Screenshot 4: Highlighted terms on page
  - [ ] Screenshot 5: Settings/configuration
- [ ] **Store Icon** (128x128px or larger) - Use `icons/icon128.png` or `icons/1024.png`

### Required Information
- [ ] **Name:** LegalGuard
- [ ] **Summary:** Written (132 characters max)
- [ ] **Description:** Written (see STORE_SUBMISSION.md for template)
- [ ] **Category:** Selected (Productivity or Utilities)
- [ ] **Language:** English (United States)
- [ ] **Privacy Policy URL:** Created and hosted
- [ ] **Support URL:** (Optional but recommended)

### Privacy & Permissions
- [ ] Privacy policy page created
- [ ] Privacy policy explains all permissions
- [ ] Single purpose declaration ready
- [ ] User data handling explained
- [ ] Permissions justified in store listing

### Build & Package
- [ ] ZIP file created using build script
- [ ] ZIP size checked (< 10MB)
- [ ] ZIP contents verified (manifest.json at root)
- [ ] Tested loading ZIP as unpacked extension

### Legal & Compliance
- [ ] Privacy policy complies with Chrome Web Store policies
- [ ] Extension complies with Chrome Web Store policies
- [ ] No copyrighted content used without permission
- [ ] All third-party libraries properly attributed

## 📋 Submission Steps

1. **Create ZIP Package**
   ```powershell
   .\build.ps1
   ```
   Or manually: See `BUILD.md`

2. **Go to Developer Dashboard**
   - Visit: https://chrome.google.com/webstore/devconsole
   - Sign in with Google account
   - Pay $5 registration fee (one-time, if not already paid)

3. **Upload Extension**
   - Click "New Item"
   - Upload `LegalGuard-v5.0.zip`
   - Wait for validation

4. **Fill Store Listing**
   - Complete all required fields
   - Upload promotional images and screenshots
   - Add privacy policy URL
   - Set pricing (Free)
   - Choose visibility (Public or Unlisted)

5. **Submit for Review**
   - Review all information
   - Submit for review
   - Wait for approval (1-3 business days)

## 🚨 Common Issues & Solutions

### "Invalid ZIP file"
- **Solution:** Make sure you're zipping the contents of `extension/`, not the folder itself
- Verify `manifest.json` is at the root of the ZIP

### "Missing required field: description"
- **Solution:** Check that `manifest.json` includes the `description` field
- Re-zip and re-upload

### "Privacy policy required"
- **Solution:** Create a privacy policy page and host it
- Add the URL in the store listing
- See privacy policy template in STORE_SUBMISSION.md

### "Extension too large"
- **Solution:** Check ZIP size (must be < 10MB)
- Remove unnecessary files
- Optimize images if needed

### "Invalid permissions"
- **Solution:** Justify all permissions in the store listing
- Explain why each permission is needed
- See permission justifications in STORE_SUBMISSION.md

## 📝 Notes

- Review process typically takes 1-3 business days
- You'll receive email notifications about review status
- If rejected, you'll get feedback on what to fix
- You can update your extension after it's published

## 🔗 Quick Links

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Chrome Web Store Policies](https://developer.chrome.com/docs/webstore/program-policies/)
- [Manifest V3 Documentation](https://developer.chrome.com/docs/extensions/mv3/)

Good luck! 🚀


