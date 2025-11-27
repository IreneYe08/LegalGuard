# Chrome Web Store Submission Guide

## 📦 Package Structure

Your extension is ready for submission! The `extension/` folder contains all the files needed.

```
extension/
├── manifest.json              # Extension configuration
├── background.js              # Service worker
├── glossary_toast.js          # Content script
├── sidepanel.html             # Side panel UI
├── sidepanel.js               # Side panel logic
├── popup.html                 # Popup UI
├── popup.js                   # Popup logic
├── marked.min.js              # Markdown library
├── glossary_tri.json          # Legal terms glossary
├── glossary_multilingual.json # Multilingual glossary
├── css/
│   └── toast.css              # Toast styles
└── icons/
    ├── 1024.png               # Store icon (128x128 or larger)
    ├── icon16.png             # 16x16 icon
    ├── icon32.png             # 32x32 icon
    ├── icon48.png             # 48x48 icon
    ├── icon128.png            # 128x128 icon
    └── icon256.png            # 256x256 icon
```

## 🚀 Submission Steps

### 1. Create ZIP Package

**Windows (PowerShell):**
```powershell
Compress-Archive -Path extension\* -DestinationPath LegalGuard-v5.0.zip
```

**Windows (Command Prompt):**
```cmd
cd extension
tar -a -c -f ..\LegalGuard-v5.0.zip *
cd ..
```

**Mac/Linux:**
```bash
cd extension
zip -r ../LegalGuard-v5.0.zip .
cd ..
```

**Important:** 
- Zip the **contents** of the `extension/` folder, not the folder itself
- The `manifest.json` should be at the root of the zip file

### 2. Chrome Web Store Developer Dashboard

1. Go to [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
2. Sign in with your Google account
3. Pay the one-time $5 registration fee (if not already paid)
4. Click "New Item" to upload your extension

### 3. Upload Your Extension

1. Upload the `LegalGuard-v5.0.zip` file
2. Wait for Chrome to validate your extension
3. Fix any errors if they appear

### 4. Fill Out Store Listing

#### Required Information:

**Name:** LegalGuard

**Summary (132 characters max):**
```
AI-powered extension that detects and explains legal terms on any webpage. Get instant alerts about privacy policies and terms of service.
```

**Description (recommended 3000+ characters):**
```
🛡️ LegalGuard — AI-Powered Legal Risk Detection

Every year, an average internet user encounters 1,400+ privacy notices and terms of service agreements — most of which go unread. LegalGuard brings AI directly into your browser to analyze, summarize, and translate complex legal text in real time.

✨ KEY FEATURES:

⚖️ Automatic Clause Detection
Detects and classifies legal keywords (privacy, liability, IP rights, payment terms) using a curated glossary. Works automatically on any webpage.

💬 Contextual Toast Alerts
Instantly surfaces a toast notification explaining the type and risk level of detected clauses. No need to manually scan pages.

📊 Side Panel Analysis
Comprehensive analysis of detected clauses, risk categories, and severity levels — powered by Chrome's built-in AI Summarizer API.

🌐 AI Translation
Uses Chrome Translator API to render summaries in your preferred language. Supports multiple languages automatically.

🎯 Smart Highlighting
Highlights detected legal terms directly on the page for easy identification. Click to see detailed explanations.

💬 Interactive Q&A
Ask questions about specific clauses and get AI-powered explanations. Get answers in simple, understandable language.

🔄 Seamless Workflow
Works automatically — simply browse, and LegalGuard activates in context. No configuration needed.

📋 CATEGORIES DETECTED:
• Data & Privacy — Data collection, sharing, and privacy rights
• Rights & Obligations — User responsibilities and platform rights
• Payment & Subscription — Billing, refunds, and subscription terms
• Legal Risks & Disclaimer — Liability limitations and disclaimers
• Intellectual Property — Copyright, trademarks, and usage rights
• User Conduct — Acceptable use policies and restrictions

🔒 PRIVACY & SECURITY:
• All AI processing happens on-device using Chrome's built-in AI APIs
• No data is sent to external servers
• Your browsing data stays private
• Open source and transparent

🚀 GETTING STARTED:
1. Install LegalGuard
2. Browse normally — LegalGuard works automatically
3. Look for toast notifications when legal terms are detected
4. Click the extension icon to open the side panel for detailed analysis
5. Ask questions about specific clauses using the Q&A feature

📖 REQUIREMENTS:
• Chrome Browser (version 126+)
• Chrome AI APIs enabled (available in Chrome 126+)

Made with ❤️ for a more transparent digital world.
```

**Category:** Productivity or Utilities

**Language:** English (United States)

**Privacy Policy URL:** (Required - you'll need to create one)
- You can host it on GitHub Pages, your website, or use a privacy policy generator
- Example: `https://yourusername.github.io/LegalGuard/privacy-policy.html`

#### Store Assets:

**Small Promotional Tile (440x280):**
- Create a promotional image showing the extension in action
- Include the LegalGuard logo and key features

**Large Promotional Tile (920x680):**
- Larger version of promotional tile
- More detailed feature showcase

**Screenshots (at least 1, recommended 3-5):**
1. Toast notification showing legal terms detected
2. Side panel with page analysis
3. Q&A interface
4. Highlighted terms on a webpage
5. Settings/configuration screen

**Icon:**
- Use `icons/icon128.png` or `icons/1024.png` (Chrome will resize)
- Must be 128x128 pixels or larger

### 5. Pricing & Distribution

- **Pricing:** Free
- **Visibility:** Public (or Unlisted for testing)
- **Regions:** All regions (or select specific ones)

### 6. Privacy Practices

**Single Purpose:**
- ✅ Yes - The extension has a single purpose: legal term detection and explanation

**User Data:**
- ✅ No user data is collected
- ✅ All processing happens on-device
- ✅ No external servers are contacted

**Permissions Justification:**
- `activeTab` - To analyze content on the current tab
- `tabs` - To open side panel on the current tab
- `storage` - To save user preferences (muted sites, language settings)
- `contextMenus` - To add "Explain" option to right-click menu
- `scripting` - To inject content scripts for term detection
- `sidePanel` - To display analysis panel
- `<all_urls>` - To work on any website the user visits

### 7. Review Process

After submission:
- Chrome will review your extension (usually 1-3 business days)
- You'll receive email notifications about the review status
- If rejected, you'll get feedback on what needs to be fixed

### 8. Post-Submission

Once approved:
- Your extension will be live in the Chrome Web Store
- Users can install it directly
- You can update it by uploading new versions
- Monitor reviews and ratings

## 📋 Pre-Submission Checklist

- [x] Manifest includes `description` field
- [x] All icons are present (16, 32, 48, 128)
- [x] Extension tested in Chrome
- [x] No console errors
- [x] Privacy policy URL ready
- [ ] Store listing images created (screenshots, promotional tiles)
- [ ] Privacy policy page created and hosted
- [ ] Extension ZIP file created correctly
- [ ] All file paths verified
- [ ] Tested on multiple websites
- [ ] Keyboard shortcuts work (Alt+L)
- [ ] Context menu works ("Explain" option)

## 🔗 Useful Links

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
- [Chrome Web Store Developer Documentation](https://developer.chrome.com/docs/webstore/)
- [Manifest V3 Documentation](https://developer.chrome.com/docs/extensions/mv3/)
- [Privacy Policy Generator](https://www.freeprivacypolicy.com/)

## 📝 Notes

- The extension uses Chrome's built-in AI APIs (LanguageModel, Summarizer, Translator)
- These APIs require Chrome 126+ with AI features enabled
- Users may need to enable AI features in Chrome settings
- The extension works offline once the AI model is downloaded

## 🆘 Troubleshooting

**"Invalid ZIP file" error:**
- Make sure you're zipping the contents of `extension/`, not the folder itself
- Check that `manifest.json` is at the root of the zip

**"Missing required field" error:**
- Verify `description` is in manifest.json
- Check that all required icons are present

**"Privacy policy required" error:**
- You must provide a privacy policy URL
- It can be hosted anywhere (GitHub Pages, your website, etc.)

Good luck with your submission! 🚀


