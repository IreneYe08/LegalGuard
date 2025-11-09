// sidepanel.js - LegalGuard Side Panel with AI Chat
class LegalGuardSidePanel {
    constructor() {
        this.currentData = null;
        this.currentMatchIndex = 0;
        this.totalMatches = 0;
        this.aiSession = null;
        this.aiAvailable = false;
        this.aiAvailabilityState = null; // Store availability state ('available', 'downloadable', 'downloading', 'unavailable')
        this.promptInputEnabled = false;
        this.elements = {};
        this.modelStatus = 'checking';
        this.summaryRetryTimer = null;
        this.hasInputText = false;
        this.currentTabId = null;
        this.conversationHistory = [];
        this.isStreaming = false;
        
        // Translation state
        this.translatorAvailable = false;
        this.userLanguage = 'auto';
        this.autoTranslate = true;
        this.translationCache = new Map();
        this.detectedLanguage = 'en';
        this.translatorToEnglish = null;
        this.translatorFromEnglish = null;
        
        // Content formatting
        this.currentTone = 'normal'; // 'normal' or 'eli3'
        this.markdownRenderer = null;
        
        this.init();
    }

    async init() {
        console.log('[LegalGuard] Side panel DOM ready and initialized');
        
        // Get current tab ID
        await this.getCurrentTab();

        // Cache key UI elements
        this.cacheUIElements();
        this.syncPromptControls();
        
        // Set up event listeners
        this.setupEventListeners();
        
        // Initialize AI
        await this.initializeAI();
        
        // Initialize Translation
        await this.initializeTranslation();
        
        // Initialize markdown rendering
        await this.initializeMarkdownRenderer();
        
        // Request data from content script
        await this.requestPageData();
        
        // Load conversation history
        await this.loadConversationHistory();
        
        // Load language preferences
        await this.loadLanguagePreferences();
        
        // Load mute state
        await this.loadMuteState();
    }

    cacheUIElements() {
        this.elements = {
            sendBtn: document.getElementById('send-btn'),
            chatInput: document.getElementById('chat-input'),
            modelOverlay: document.getElementById('modelDownloadOverlay'),
            modelOverlayMessage: document.getElementById('modelDownloadMessage'),
            muteToggleBtn: document.getElementById('muteToggleBtn')
        };
    }

    syncPromptControls() {
        const { chatInput, sendBtn } = this.elements;

        if (chatInput) {
            chatInput.disabled = !this.promptInputEnabled;
        }

        if (sendBtn) {
            const shouldDisable = !this.promptInputEnabled || this.isStreaming || !this.hasInputText;
            sendBtn.disabled = shouldDisable;
        }
    }

    setPromptInputEnabled(enabled) {
        this.promptInputEnabled = enabled;
        this.syncPromptControls();
    }

    updateModelDownloadUI(status, message) {
        this.modelStatus = status;
        const { modelOverlay, modelOverlayMessage } = this.elements;

        if (modelOverlayMessage && typeof message === 'string') {
            modelOverlayMessage.innerHTML = message;
        }

        if (modelOverlay) {
            if (status === 'downloading' || status === 'preparing') {
                modelOverlay.classList.add('visible');
            } else {
                modelOverlay.classList.remove('visible');
            }
        }

        if (status === 'downloading' || status === 'preparing') {
            this.setPromptInputEnabled(false);
        } else if (status === 'ready') {
            this.setPromptInputEnabled(true);
        }
    }

    updateMuteButton(isMuted) {
        const muteBtn = this.elements?.muteToggleBtn || document.getElementById('muteToggleBtn');
        if (!muteBtn) return;

        muteBtn.textContent = isMuted ? '🔕' : '🔔';
        muteBtn.dataset.state = isMuted ? 'muted' : 'unmuted';
        muteBtn.setAttribute('aria-pressed', isMuted ? 'true' : 'false');
        muteBtn.setAttribute('aria-label', isMuted ? 'Unmute notifications' : 'Mute notifications');
        muteBtn.setAttribute('title', isMuted ? 'Unmute notifications' : 'Mute notifications');
    }

    async getCurrentTab() {
        try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            this.currentTabId = tab?.id;
        } catch (error) {
            console.warn('[LegalGuard] Could not get current tab:', error);
        }
    }

    async initializeAI() {
        try {
            // Check if LanguageModel is available
            if (typeof LanguageModel === 'undefined') {
                this.updateAPIStatus('unavailable', 'AI not available in this browser');
                return;
            }

            // Check availability
            const availability = await LanguageModel.availability();
            console.log('[LegalGuard] AI availability:', availability);
            this.aiAvailabilityState = availability;

            if (availability === 'unavailable') {
                this.updateAPIStatus('unavailable', 'AI not available on this device');
                this.aiAvailable = false;
                this.updateModelDownloadUI('hidden');
                this.setPromptInputEnabled(false);
                return;
            }

            // Don't create session during initialization if model needs to be downloaded
            // Chrome requires a user gesture to download models
            if (availability === 'downloadable' || availability === 'downloading') {
                this.updateAPIStatus('downloadable', 'Click "Ask" to download and enable AI (requires user gesture)');
                this.aiAvailable = false;
                this.updateModelDownloadUI('downloading', 'Downloading Chrome AI model (first-time setup)...<br>Please wait a few minutes.');
                // Don't create session here - wait for user gesture
                return;
            } else if (availability === 'available') {
                // Model is already available, safe to create session
                try {
                    this.aiSession = await LanguageModel.create();
                    this.aiAvailable = true;
                    this.updateAPIStatus('available', 'AI ready! Ask any legal question.');
                    this.updateModelDownloadUI('ready');
                } catch (error) {
                    console.warn('[LegalGuard] Could not create AI session:', error);
                    this.updateAPIStatus('unavailable', 'Failed to initialize AI');
                    this.aiAvailable = false;
                    this.updateModelDownloadUI('hidden');
                    this.setPromptInputEnabled(false);
                    return;
                }
            }

        } catch (error) {
            console.warn('[LegalGuard] AI initialization failed:', error);
            this.updateAPIStatus('unavailable', 'AI initialization failed');
            this.aiAvailable = false;
            this.updateModelDownloadUI('hidden');
            this.setPromptInputEnabled(false);
        }
    }

    async ensureAISession() {
        // If session already exists, return
        if (this.aiSession && this.aiAvailable) {
            this.updateModelDownloadUI('ready');
            return true;
        }

        // Check if LanguageModel is available
        if (typeof LanguageModel === 'undefined') {
            this.updateAPIStatus('unavailable', 'AI not available in this browser');
            this.updateModelDownloadUI('hidden');
            return false;
        }

        try {
            // Re-check availability in case it changed
            const availability = await LanguageModel.availability();
            this.aiAvailabilityState = availability;

            if (availability === 'unavailable') {
                this.updateAPIStatus('unavailable', 'AI not available on this device');
                this.updateModelDownloadUI('hidden');
                return false;
            }

            // Now we have a user gesture, safe to create session and download if needed
            if (availability === 'downloadable' || availability === 'downloading') {
                this.updateAPIStatus('downloading', 'Downloading AI model...');
                this.updateModelDownloadUI('downloading', 'Downloading Chrome AI model (first-time setup)...<br>Please wait a few minutes.');
                
                try {
                    const self = this;
                    this.aiSession = await LanguageModel.create({
                        monitor(m) {
                            m.addEventListener('downloadprogress', (e) => {
                                const ratio = typeof e.loaded === 'number' ? e.loaded : null;
                                const percent = ratio !== null ? Math.round(ratio * 100) : null;
                                console.log(`[LegalGuard] Downloaded ${percent ?? '?'}%`);
                                // Update status with progress
                                const statusElement = document.getElementById('apiStatus');
                                if (statusElement) {
                                    statusElement.textContent = percent !== null
                                        ? `Downloading AI model... ${percent}%`
                                        : 'Downloading AI model...';
                                }
                                const overlayMessage = self?.elements?.modelOverlayMessage;
                                if (overlayMessage) {
                                    overlayMessage.innerHTML = percent !== null
                                        ? `Downloading Chrome AI model (first-time setup)...<br>${percent}% complete`
                                        : 'Downloading Chrome AI model (first-time setup)...<br>Please wait a few minutes.';
                                }
                                if (percent !== null) {
                                    self.updateModelDownloadUI('downloading', `Downloading Chrome AI model (first-time setup)...<br>${percent}% complete`);
                                }
                            });
                            m.addEventListener('downloadcompleted', () => {
                                self.updateModelDownloadUI('preparing', 'Almost there... getting LegalGuard ready.');
                            });
                            m.addEventListener('downloadfailed', () => {
                                self.updateModelDownloadUI('hidden', 'Failed to download Chrome AI model. Please try again.');
                                const statusElement = document.getElementById('apiStatus');
                                if (statusElement) {
                                    statusElement.textContent = 'Failed to download AI model. Try again.';
                                }
                                self.setPromptInputEnabled(true);
                            });
                        },
                    });
                    this.aiAvailable = true;
                    this.updateAPIStatus('available', 'AI ready! Ask any legal question.');
                    this.updateModelDownloadUI('ready');
                    return true;
                } catch (error) {
                    console.warn('[LegalGuard] Could not create AI session:', error);
                    this.updateAPIStatus('unavailable', `Failed to initialize AI: ${error.message}`);
                    this.updateModelDownloadUI('hidden', 'Failed to download Chrome AI model. Please try again.');
                    this.setPromptInputEnabled(true);
                    return false;
                }
            } else if (availability === 'available') {
                try {
                    this.aiSession = await LanguageModel.create();
                    this.aiAvailable = true;
                    this.updateAPIStatus('available', 'AI ready! Ask any legal question.');
                    this.updateModelDownloadUI('ready');
                    return true;
                } catch (error) {
                    console.warn('[LegalGuard] Could not create AI session:', error);
                    this.updateAPIStatus('unavailable', `Failed to initialize AI: ${error.message}`);
                    this.updateModelDownloadUI('hidden', `Failed to initialize AI: ${error.message}`);
                    this.setPromptInputEnabled(true);
                    return false;
                }
            }

            return false;
        } catch (error) {
            console.warn('[LegalGuard] Failed to ensure AI session:', error);
            this.updateAPIStatus('unavailable', `AI initialization failed: ${error.message}`);
            this.updateModelDownloadUI('hidden', `AI initialization failed: ${error.message}`);
            this.setPromptInputEnabled(true);
            return false;
        }
    }

    async initializeTranslation() {
        try {
            // Check if Translator API is available
            if (typeof Translator === 'undefined') {
                console.log('[LegalGuard] Translator API not available');
                this.updateTranslationStatus('Translator API not available');
                return;
            }

            // Check general availability with required arguments
            const availability = await Translator.availability({
                sourceLanguage: 'en',
                targetLanguage: 'es'
            });
            console.log('[LegalGuard] Translator availability:', availability);

            if (availability === 'unavailable') {
                this.updateTranslationStatus('Translation not available on this device');
                return;
            }

            // Don't create translators during initialization - wait for user gesture
            if (availability === 'downloadable' || availability === 'downloading') {
                this.updateTranslationStatus('Translation ready - will download on first use');
            } else {
                this.updateTranslationStatus('Translation ready');
            }

            this.translatorAvailable = true;

        } catch (error) {
            console.warn('[LegalGuard] Translation initialization failed:', error);
            this.updateTranslationStatus('Translation initialization failed');
        }
    }

    async initializeMarkdownRenderer() {
        try {
            // Check if marked is available
            if (typeof marked !== 'undefined') {
                // Configure marked with security options
                marked.setOptions({
                    breaks: true,
                    gfm: true,
                    sanitize: false, // We'll use DOMPurify instead
                    smartLists: true,
                    smartypants: true
                });
                this.markdownRenderer = marked;
                console.log('[LegalGuard] Markdown renderer initialized');
            } else {
                console.warn('[LegalGuard] Marked library not available');
            }
        } catch (error) {
            console.warn('[LegalGuard] Markdown renderer initialization failed:', error);
        }
    }

    getResponseSchema(tone = 'normal') {
        const baseSchema = {
            type: "object",
            properties: {
                title: {
                    type: "string",
                    description: "A clear, concise title for the response"
                },
                summary: {
                    type: "string",
                    description: "A brief 1-2 sentence summary"
                },
                sections: {
                    type: "array",
                    description: "Array of content sections",
                    items: {
                        type: "object",
                        properties: {
                            heading: {
                                type: "string",
                                description: "Section heading"
                            },
                            content: {
                                type: "string",
                                description: "Section content in markdown format"
                            },
                            points: {
                                type: "array",
                                description: "Key points as an array of strings",
                                items: {
                                    type: "string"
                                }
                            }
                        },
                        required: ["heading", "content"]
                    }
                },
                key_takeaways: {
                    type: "array",
                    description: "Important takeaways as bullet points",
                    items: {
                        type: "string"
                    }
                },
                tone: {
                    type: "string",
                    enum: ["normal", "eli3"],
                    description: "The tone used in the response"
                }
            },
            required: ["title", "summary", "sections", "tone"]
        };

        if (tone === 'eli3') {
            // Add emoji requirements for ELI3 mode
            baseSchema.properties.sections.items.properties.points.items.description = 
                "Key point with exactly one emoji at the start (e.g., '🎯 This is important')";
            baseSchema.properties.key_takeaways.items.description = 
                "Takeaway with exactly one emoji at the start (e.g., '💡 Remember this')";
        }

        return baseSchema;
    }

    async translateStructuredResponse(jsonData, sourceLanguage, targetLanguage) {
        try {
            const translatedData = { ...jsonData };
            
            // Translate title
            if (translatedData.title) {
                translatedData.title = await this.translateText(translatedData.title, sourceLanguage, targetLanguage);
            }
            
            // Translate summary
            if (translatedData.summary) {
                translatedData.summary = await this.translateText(translatedData.summary, sourceLanguage, targetLanguage);
            }
            
            // Translate sections
            if (translatedData.sections && Array.isArray(translatedData.sections)) {
                for (const section of translatedData.sections) {
                    if (section.heading) {
                        section.heading = await this.translateText(section.heading, sourceLanguage, targetLanguage);
                    }
                    if (section.content) {
                        section.content = await this.translateText(section.content, sourceLanguage, targetLanguage);
                    }
                    if (section.points && Array.isArray(section.points)) {
                        for (let i = 0; i < section.points.length; i++) {
                            section.points[i] = await this.translateText(section.points[i], sourceLanguage, targetLanguage);
                        }
                    }
                }
            }
            
            // Translate key takeaways
            if (translatedData.key_takeaways && Array.isArray(translatedData.key_takeaways)) {
                for (let i = 0; i < translatedData.key_takeaways.length; i++) {
                    translatedData.key_takeaways[i] = await this.translateText(translatedData.key_takeaways[i], sourceLanguage, targetLanguage);
                }
            }
            
            return translatedData;
        } catch (error) {
            console.warn('[LegalGuard] Failed to translate structured response:', error);
            return jsonData; // Return original if translation fails
        }
    }

    createStructuredPrompt(userMessage, tone = 'normal', targetLanguage = 'en') {
        // Define language-specific structure templates
        const languageTemplates = {
            'en': {
                summary: '**Summary:**',
                keyPoints: '**Key Points:**',
                bulletPrefix: '-',
                wordCount: 'WORD COUNT: Count your words. If over 160 words, compress until ≤160 words.'
            },
            'es': {
                summary: '**Resumen:**',
                keyPoints: '**Puntos Clave:**',
                bulletPrefix: '-',
                wordCount: 'CONTEO DE PALABRAS: Cuenta tus palabras. Si son más de 160 palabras, comprime hasta ≤160 palabras.'
            },
            'fr': {
                summary: '**Résumé:**',
                keyPoints: '**Points Clés:**',
                bulletPrefix: '-',
                wordCount: 'COMPTAGE DE MOTS: Compte tes mots. Si plus de 160 mots, compresse jusqu\'à ≤160 mots.'
            },
            'de': {
                summary: '**Zusammenfassung:**',
                keyPoints: '**Wichtige Punkte:**',
                bulletPrefix: '-',
                wordCount: 'WORTZAHL: Zähle deine Wörter. Wenn über 160 Wörter, komprimiere bis ≤160 Wörter.'
            },
            'it': {
                summary: '**Riassunto:**',
                keyPoints: '**Punti Chiave:**',
                bulletPrefix: '-',
                wordCount: 'CONTO DELLE PAROLE: Conta le tue parole. Se più di 160 parole, comprimi fino a ≤160 parole.'
            },
            'pt': {
                summary: '**Resumo:**',
                keyPoints: '**Pontos Principais:**',
                bulletPrefix: '-',
                wordCount: 'CONTAGEM DE PALAVRAS: Conte suas palavras. Se mais de 160 palavras, comprima até ≤160 palavras.'
            },
            'zh': {
                summary: '**摘要:**',
                keyPoints: '**要点:**',
                bulletPrefix: '-',
                wordCount: '字数统计: 计算你的字数。如果超过160字，压缩到≤160字。'
            },
            'ja': {
                summary: '**要約:**',
                keyPoints: '**重要なポイント:**',
                bulletPrefix: '-',
                wordCount: '単語数: 単語を数えてください。160語を超える場合は、≤160語まで圧縮してください。'
            }
        };

        const template = languageTemplates[targetLanguage] || languageTemplates['en'];
        
        let systemPrompt = `You are a helpful legal assistant. Your role is to explain legal terms and clauses in clear, structured language.

CRITICAL REQUIREMENTS:
- Return MARKDOWN ONLY. No HTML tags. No <div>, <p>, <span>, <br>, etc.
- Write in the target language: ${targetLanguage === 'en' ? 'English' : targetLanguage === 'es' ? 'Spanish' : targetLanguage === 'fr' ? 'French' : targetLanguage === 'de' ? 'German' : targetLanguage === 'it' ? 'Italian' : targetLanguage === 'pt' ? 'Portuguese' : targetLanguage === 'zh' ? 'Chinese' : targetLanguage === 'ja' ? 'Japanese' : 'English'}
- Hard limit: ≤ 160 words total
- Use this exact structure:

### [Short Title]

${template.summary} [2 sentences maximum]

#### [Bold Heading 1]
[1-2 short lines]

#### [Bold Heading 2] 
[1-2 short lines]

#### [Bold Heading 3]
[1-2 short lines]

${template.keyPoints}
${template.bulletPrefix} [Risk/Next-step bullet 1]
${template.bulletPrefix} [Risk/Next-step bullet 2] 
${template.bulletPrefix} [Risk/Next-step bullet 3]
${template.bulletPrefix} [Risk/Next-step bullet 4]

${template.wordCount}`;

        if (tone === 'eli3') {
            systemPrompt += `

ELI3 MODE REQUIREMENTS:
- Use simple, kid-friendly language
- Add exactly ONE emoji to each bullet point
- Use words a 3-year-old would understand
- Keep sentences short and clear
- Use fun analogies when possible
- Examples: "🎯 This means..." "💡 Remember..." "⚠️ Watch out for..."`;
        }

        systemPrompt += `

Current page context:`;
        
        // Add page context if available
        if (this.currentData) {
            if (this.currentData.pageSummary) {
                systemPrompt += `\nPage Summary: ${this.currentData.pageSummary}`;
            }
            if (this.currentData.categories) {
                const categories = Object.keys(this.currentData.categories).join(', ');
                systemPrompt += `\nLegal categories detected: ${categories}`;
            }
        }

        systemPrompt += `\n\nUser question: ${userMessage}`;
        
        return systemPrompt;
    }

    renderMarkdown(markdownText, isELI3 = false) {
        try {
            if (!this.markdownRenderer) {
                // Fallback: basic HTML escaping and simple formatting
                return this.basicMarkdownRender(markdownText);
            }

            // Configure markdown renderer for consistent output
            this.markdownRenderer.setOptions({
                html: false,        // Disable HTML tags
                breaks: true,      // Convert line breaks to <br>
                gfm: true,         // GitHub Flavored Markdown
                sanitize: false,   // We'll handle sanitization separately
                smartLists: true,
                smartypants: false
            });

            // Render markdown to HTML
            let html = this.markdownRenderer.parse(markdownText);
            
            // Sanitize HTML locally (replacing DOMPurify)
            html = this.sanitizeHTML(html);
            html = this.transformClauseMarkdown(html);
            
            return html;
        } catch (error) {
            console.warn('[LegalGuard] Markdown rendering failed:', error);
            return this.basicMarkdownRender(markdownText);
        }
    }

    sanitizeHTML(html) {
        // Simple HTML sanitization - remove potentially dangerous elements
        const allowedTags = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'br', 'strong', 'b', 'em', 'i', 'ul', 'ol', 'li', 'blockquote', 'code', 'pre'];
        
        // Create a temporary div to parse HTML
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = html;
        
        // Remove any script tags or dangerous attributes
        const scripts = tempDiv.querySelectorAll('script');
        scripts.forEach(script => script.remove());
        
        // Remove any elements with dangerous attributes
        const elementsWithAttrs = tempDiv.querySelectorAll('*');
        elementsWithAttrs.forEach(element => {
            // Remove all attributes except for basic ones
            const attrs = Array.from(element.attributes);
            attrs.forEach(attr => {
                if (!['class', 'id'].includes(attr.name)) {
                    element.removeAttribute(attr.name);
                }
            });
        });
        
        return tempDiv.innerHTML;
    }

    escapeHTML(text = '') {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    normalizeText(text = '') {
        return (text || '').replace(/\s+/g, ' ').trim();
    }

    truncateTextByChars(text = '') {
        return this.normalizeText(text);
    }

    truncateWords(text = '') {
        return this.normalizeText(text);
    }

    stripLabel(text = '') {
        const normalized = this.normalizeText(text);
        const colonIndex = normalized.indexOf(':');
        if (colonIndex === -1) return normalized;
        return normalized.slice(colonIndex + 1).trim();
    }

    buildClauseCardHTML({ title, summary, details, keyPoints }) {
        let html = '<div class="lg-clause-card p-3 mb-2 rounded-xl border border-gray-100 shadow-sm bg-white">';

        if (title) {
            html += `<h3 class="text-sm font-semibold text-gray-800 mb-1 line-clamp-1">${this.escapeHTML(title)}</h3>`;
        }

        if (summary) {
            html += `<p class="text-xs text-gray-600 mb-1"><span class="font-medium text-gray-700">💡 Summary:</span> ${this.escapeHTML(summary)}</p>`;
        }

        if (details) {
            html += `<p class="text-xs text-gray-500 mb-1"><span class="font-medium text-gray-700">🔹 Detail:</span> ${this.escapeHTML(details)}</p>`;
        }

        if (keyPoints && keyPoints.length > 0) {
            html += '<ul class="list-disc list-inside text-xs text-gray-500 space-y-0.5">';
            keyPoints.forEach((point, index) => {
                const display = this.escapeHTML(point);
                html += `<li>⚠️ ${display}</li>`;
            });
            html += '</ul>';
        }

        html += '</div>';
        return html;
    }

    transformClauseMarkdown(html) {
        try {
            if (!html || !html.includes('<h3')) {
                return html;
            }

            const temp = document.createElement('div');
            temp.innerHTML = html;
            const headings = Array.from(temp.querySelectorAll('h3'));
            if (!headings.length) {
                return html;
            }

            const cards = [];
            const summaryRegex = /(summary|resumen|résumé|zusammenfassung|riassunto|resumo|摘要|要約)/i;

            headings.forEach((heading) => {
                const cardData = {
                    title: this.normalizeText(heading.textContent),
                    summary: '',
                    detailsSegments: [],
                    keyPoints: []
                };

                let node = heading.nextElementSibling;
                while (node) {
                    const tag = node.tagName;
                    if (tag === 'H3') break;

                    if (!cardData.summary && tag === 'P') {
                        const strong = node.querySelector('strong');
                        const labelText = strong ? this.normalizeText(strong.textContent) : '';
                        if (summaryRegex.test(labelText)) {
                            cardData.summary = this.normalizeText(this.stripLabel(node.textContent));
                        }
                    }

                    if (tag === 'H4') {
                        const label = this.normalizeText(node.textContent).replace(/[:：]\s*$/, '');
                        let detailContent = '';
                        let detailNode = node.nextElementSibling;
                        while (detailNode && !['H3', 'H4', 'UL'].includes(detailNode.tagName)) {
                            if (detailNode.tagName === 'P') {
                                detailContent = this.normalizeText(detailNode.textContent);
                                break;
                            }
                            detailNode = detailNode.nextElementSibling;
                        }

                        if (detailContent) {
                            const combined = `${label}: ${detailContent}`;
                            cardData.detailsSegments.push(this.normalizeText(combined));
                        }
                    }

                    if (tag === 'UL') {
                        const bulletItems = Array.from(node.querySelectorAll('li')).map((li) =>
                            this.normalizeText(li.textContent)
                        );
                        if (bulletItems.length) {
                            cardData.keyPoints.push(...bulletItems);
                        }
                    }

                    node = node.nextElementSibling;
                }

                const details = cardData.detailsSegments.join('; ');
                const keyPoints = cardData.keyPoints.slice(0, 3);
                const hasContent = cardData.title || cardData.summary || details || keyPoints.length;
                if (hasContent) {
                    cards.push(this.buildClauseCardHTML({
                        title: cardData.title,
                        summary: cardData.summary,
                        details,
                        keyPoints
                    }));
                }
            });

            if (!cards.length) {
                return html;
            }

            return `<div class="lg-clause-stack">${cards.join('')}</div>`;
        } catch (error) {
            console.warn('[LegalGuard] Failed to transform clause markdown:', error);
            return html;
        }
    }

    countWords(text) {
        // Simple word count function
        return text.trim().split(/\s+/).filter(word => word.length > 0).length;
    }

    removeWordCountFromResponse(response) {
        // Remove word count lines from the response
        const wordCountPatterns = [
            /^WORD COUNT:.*$/gm,
            /^CONTEO DE PALABRAS:.*$/gm,
            /^COMPTAGE DE MOTS:.*$/gm,
            /^WORTZAHL:.*$/gm,
            /^CONTO DELLE PAROLE:.*$/gm,
            /^CONTAGEM DE PALAVRAS:.*$/gm,
            /^字数统计:.*$/gm,
            /^単語数:.*$/gm
        ];
        
        let cleanedResponse = response;
        wordCountPatterns.forEach(pattern => {
            cleanedResponse = cleanedResponse.replace(pattern, '');
        });
        
        // Clean up any extra newlines at the end
        return cleanedResponse.trim();
    }

    validateWordCount(text, maxWords = 160) {
        const wordCount = this.countWords(text);
        if (wordCount > maxWords) {
            console.warn(`[LegalGuard] Response exceeds ${maxWords} words (${wordCount} words). Consider compression.`);
            return false;
        }
        return true;
    }

    basicMarkdownRender(text) {
        // Basic markdown rendering fallback with proper line break handling
        return text
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/^### (.*$)/gm, '<h3>$1</h3>')
            .replace(/^#### (.*$)/gm, '<h4>$1</h4>')
            .replace(/^- (.*$)/gm, '<li>$1</li>')
            .replace(/(<li>.*<\/li>)/s, '<ul>$1</ul>')
            .replace(/\n\n/g, '</p><p>')
            .replace(/\n/g, '<br>')
            .replace(/^(.*)$/, '<p>$1</p>');
    }

    renderStructuredContent(jsonResponse, isELI3 = false) {
        try {
            const data = typeof jsonResponse === 'string' ? JSON.parse(jsonResponse) : jsonResponse;
            
            let html = `<div class="structured-content ${isELI3 ? 'eli3-mode' : ''}">`;
            
            // Title
            if (data.title) {
                html += `<h1>${data.title}</h1>`;
            }
            
            // Summary
            if (data.summary) {
                html += `<p><strong>Summary:</strong> ${data.summary}</p>`;
            }
            
            // Sections
            if (data.sections && Array.isArray(data.sections)) {
                data.sections.forEach(section => {
                    html += `<h2>${section.heading}</h2>`;
                    
                    if (section.content) {
                        html += this.renderMarkdown(section.content, isELI3);
                    }
                    
                    if (section.points && Array.isArray(section.points)) {
                        html += '<ul>';
                        section.points.forEach(point => {
                            html += `<li>${this.renderMarkdown(point, isELI3)}</li>`;
                        });
                        html += '</ul>';
                    }
                });
            }
            
            // Key takeaways
            if (data.key_takeaways && Array.isArray(data.key_takeaways)) {
                html += '<h3>Key Takeaways</h3><ul>';
                data.key_takeaways.forEach(takeaway => {
                    html += `<li>${this.renderMarkdown(takeaway, isELI3)}</li>`;
                });
                html += '</ul>';
            }
            
            html += '</div>';
            return html;
            
        } catch (error) {
            console.warn('[LegalGuard] Structured content rendering failed:', error);
            // Fallback to basic rendering
            return `<div class="structured-content">${this.renderMarkdown(jsonResponse, isELI3)}</div>`;
        }
    }

    async detectLanguage(text) {
        try {
            if (typeof LanguageDetector === 'undefined') {
                return 'en'; // Default to English if detection not available
            }

            const detector = await LanguageDetector.create();
            const result = await detector.detect(text);
            return result.language || 'en';
        } catch (error) {
            console.warn('[LegalGuard] Language detection failed:', error);
            return 'en';
        }
    }

    async createTranslator(sourceLanguage, targetLanguage) {
        try {
            const cacheKey = `${sourceLanguage}-${targetLanguage}`;
            
            // Check cache first
            if (this.translationCache.has(cacheKey)) {
                return this.translationCache.get(cacheKey);
            }

            // Check availability for this language pair
            const availability = await Translator.availability({
                sourceLanguage,
                targetLanguage
            });

            if (availability === 'unavailable') {
                throw new Error(`Translation not available for ${sourceLanguage} to ${targetLanguage}`);
            }

            // Create translator with progress monitoring (following Chrome API docs)
            const translator = await Translator.create({
                sourceLanguage,
                targetLanguage,
                monitor(m) {
                    m.addEventListener('downloadprogress', (e) => {
                        console.log(`Downloaded ${e.loaded * 100}% for ${sourceLanguage}-${targetLanguage}`);
                    });
                },
            });

            // Cache the translator
            this.translationCache.set(cacheKey, translator);
            return translator;

        } catch (error) {
            console.warn('[LegalGuard] Failed to create translator:', error);
            throw error;
        }
    }

    async translateText(text, sourceLanguage, targetLanguage) {
        try {
            console.log('[LegalGuard] translateText called:', {
                text: text.substring(0, 100) + '...',
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage
            });
            
            if (sourceLanguage === targetLanguage) {
                console.log('[LegalGuard] No translation needed - same language');
                return text; // No translation needed
            }

            const translator = await this.createTranslator(sourceLanguage, targetLanguage);
            const result = await translator.translate(text);
            
            console.log('[LegalGuard] Translation successful:', {
                original: text.substring(0, 50) + '...',
                translated: result.substring(0, 50) + '...'
            });
            
            return result;

        } catch (error) {
            console.warn('[LegalGuard] Translation failed:', error);
            return text; // Return original text if translation fails
        }
    }

    updateTranslationStatus(message) {
        const statusElement = document.getElementById('translationStatus');
        if (!statusElement) return;

        // Handle undefined or null message
        if (!message) {
            message = 'Translation status unknown';
        }

        statusElement.textContent = message;
        
        if (message.includes('not available') || message.includes('failed')) {
            statusElement.style.color = '#dc2626';
        } else if (message.includes('ready')) {
            statusElement.style.color = '#059669';
        } else {
            statusElement.style.color = '#64748b';
        }
    }

    updateAPIStatus(status, message) {
        const statusElement = document.getElementById('apiStatus');
        if (!statusElement) return;

        statusElement.style.display = 'block';
        statusElement.className = `api-status ${status}`;
        statusElement.textContent = message;

        // Hide status after a delay if available
        if (status === 'available') {
            setTimeout(() => {
                statusElement.style.display = 'none';
            }, 3000);
        }
    }

    setupEventListeners() {
        // Chat input
        const chatInput = document.getElementById('chat-input');
        const sendBtn = document.getElementById('send-btn');
        
        if (chatInput) {
            chatInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.sendMessage();
                }
            });
            
            chatInput.addEventListener('input', () => {
                this.hasInputText = chatInput.value.trim().length > 0;
                this.syncPromptControls();
            });
        }

        if (sendBtn) {
            sendBtn.addEventListener('click', () => this.sendMessage());
        }

        // Quick action buttons
        document.getElementById('explain-btn')?.addEventListener('click', () => {
            this.sendQuickAction('explain');
        });

        document.getElementById('eli3-btn')?.addEventListener('click', () => {
            this.sendQuickAction('eli3');
        });

        document.getElementById('clear-btn')?.addEventListener('click', () => {
            this.clearConversation();
        });

        // Language controls
        document.getElementById('userLanguage')?.addEventListener('change', (e) => {
            this.userLanguage = e.target.value;
            this.saveLanguagePreferences();
            this.updateTranslationStatus('Language preference updated');
        });

        document.getElementById('autoTranslate')?.addEventListener('change', (e) => {
            this.autoTranslate = e.target.checked;
            this.saveLanguagePreferences();
            this.updateTranslationStatus('Auto-translate setting updated');
        });

        // Mute toggle button
        const muteBtn = this.elements?.muteToggleBtn || document.getElementById('muteToggleBtn');
        if (muteBtn) {
            muteBtn.addEventListener('click', async () => {
                const currentlyMuted = muteBtn.dataset.state === 'muted';
                const newMuted = !currentlyMuted;
                await this.toggleMute(newMuted);
            });
        }
    }

    async sendMessage() {
        const chatInput = this.elements?.chatInput || document.getElementById('chat-input');
        if (!chatInput || chatInput.disabled || this.isStreaming) return;

        const originalMessage = chatInput.value.trim();
        if (!originalMessage) return;

        // Ensure AI session is created (this will handle user gesture requirement)
        const aiReady = await this.ensureAISession();
        if (!aiReady || !this.aiAvailable) {
            return;
        }

        // Clear input
        chatInput.value = '';
        this.hasInputText = false;
        this.syncPromptControls();

        // Detect language if auto-detect is enabled
        let sourceLanguage = this.userLanguage;
        if (sourceLanguage === 'auto') {
            sourceLanguage = await this.detectLanguage(originalMessage);
            this.detectedLanguage = sourceLanguage;
        }

        // Translate to English only if needed for AI processing (when source language is not English)
        let messageToSend = originalMessage;
        let translatedMessage = originalMessage;
        
        if (sourceLanguage !== 'en') {
            try {
                messageToSend = await this.translateText(originalMessage, sourceLanguage, 'en');
                translatedMessage = messageToSend;
            } catch (error) {
                console.warn('[LegalGuard] Failed to translate user message to English:', error);
                // If translation failed due to user gesture requirement, try to initialize translation
                if (error.message.includes('user gesture')) {
                    try {
                        await this.initializeTranslation();
                        // Retry translation after initialization
                        messageToSend = await this.translateText(originalMessage, sourceLanguage, 'en');
                        translatedMessage = messageToSend;
                    } catch (retryError) {
                        console.warn('[LegalGuard] Translation retry failed:', retryError);
                        // Continue with original message if translation fails
                    }
                }
            }
        }

        // Add user message (always show original)
        const messageElement = this.addMessage('user', originalMessage);
        
        // Add translation controls if message was translated to English for AI processing
        if (sourceLanguage !== 'en' && translatedMessage !== originalMessage) {
            this.addTranslationControls(messageElement, originalMessage, translatedMessage, 'user');
        }
        
        // Add to conversation history (store both original and translated)
        this.conversationHistory.push({ 
            role: 'user', 
            content: originalMessage,
            translated: translatedMessage,
            sourceLanguage: sourceLanguage
        });
        await this.saveConversationHistory();

        // Generate AI response using English message
        try {
            await this.generateAIResponse(messageToSend, sourceLanguage, this.currentTone);
        } finally {
            this.isStreaming = false;
            this.syncPromptControls();
        }
    }

    async sendQuickAction(action) {
        if (this.isStreaming) return;

        // Ensure AI session is created (this will handle user gesture requirement)
        const aiReady = await this.ensureAISession();
        if (!aiReady || !this.aiAvailable) {
            return;
        }

        const chatInput = this.elements?.chatInput || document.getElementById('chat-input');
        const selectedText = chatInput?.value?.trim() || '';
        
        // Set tone based on action
        this.currentTone = action === 'eli3' ? 'eli3' : 'normal';
        
        let prompt = '';
        switch (action) {
            case 'explain':
                prompt = selectedText ? 
                    `Please explain this legal clause in simple terms: "${selectedText}"` :
                    'Please explain the legal terms detected on this page in simple terms.';
                break;
            case 'eli3':
                prompt = selectedText ?
                    `Explain this legal clause like I'm 3 years old: "${selectedText}"` :
                    'Explain the legal terms on this page like I\'m 3 years old.';
                break;
        }

        if (prompt) {
            if (chatInput) {
                chatInput.value = '';
            }
            this.hasInputText = false;
            this.syncPromptControls();
            
            // Detect language and translate if needed
            let sourceLanguage = this.userLanguage;
            if (sourceLanguage === 'auto') {
                sourceLanguage = await this.detectLanguage(prompt);
            }
            
            let messageToSend = prompt;
            let translatedPrompt = prompt;
            
            if (sourceLanguage !== 'en') {
                try {
                    messageToSend = await this.translateText(prompt, sourceLanguage, 'en');
                    translatedPrompt = messageToSend;
                } catch (error) {
                    console.warn('[LegalGuard] Failed to translate quick action prompt:', error);
                    // If translation failed due to user gesture requirement, try to initialize translation
                    if (error.message.includes('user gesture')) {
                        try {
                            await this.initializeTranslation();
                            // Retry translation after initialization
                            messageToSend = await this.translateText(prompt, sourceLanguage, 'en');
                            translatedPrompt = messageToSend;
                        } catch (retryError) {
                            console.warn('[LegalGuard] Translation retry failed:', retryError);
                        }
                    }
                }
            }
            
            const messageElement = this.addMessage('user', prompt);
            
            // Add translation controls if prompt was translated to English for AI processing
            if (sourceLanguage !== 'en' && translatedPrompt !== prompt) {
                this.addTranslationControls(messageElement, prompt, translatedPrompt, 'user');
            }
            
            this.conversationHistory.push({ 
                role: 'user', 
                content: prompt,
                translated: translatedPrompt,
                sourceLanguage: sourceLanguage
            });
            await this.saveConversationHistory();
            await this.generateAIResponse(messageToSend, sourceLanguage);
        }
    }

    async generateAIResponse(userMessage, sourceLanguage = 'en', tone = 'normal') {
        if (!this.aiSession || this.isStreaming) return;

        this.isStreaming = true;
        this.syncPromptControls();
        const assistantMessageElement = this.addMessage('assistant', '', true);

        try {
            // Use streaming without JSON constraints (Markdown output)
            // Use the source language for AI output, but ensure it's a supported language
            const supportedLanguages = ['en', 'es', 'ja']; // Supported by Chrome LanguageModel
            const outputLanguage = supportedLanguages.includes(sourceLanguage) ? sourceLanguage : 'en';
            
            // Create structured prompt with Markdown output
            const structuredPrompt = this.createStructuredPrompt(userMessage, tone, outputLanguage);
            
            const stream = this.aiSession.promptStreaming(structuredPrompt, {
                outputLanguage: outputLanguage
            });
            
            let fullResponse = '';
            for await (const chunk of stream) {
                fullResponse += chunk;
                // Show streaming indicator
                assistantMessageElement.innerHTML = '<div class="message-streaming">Generating response...</div>';
                this.scrollToBottom();
            }

            // Remove streaming class and render markdown content
            assistantMessageElement.classList.remove('message-streaming');
            
            // Validate word count
            const wordCount = this.countWords(fullResponse);
            console.log(`[LegalGuard] Response word count: ${wordCount}`);
            
            // Since AI now responds directly in the target language, no translation needed
            // Clean the response by removing word count information
            const cleanedResponse = this.removeWordCountFromResponse(fullResponse);
            
            // Render the markdown response directly
            const isELI3 = tone === 'eli3';
            const renderedContent = this.renderMarkdown(cleanedResponse, isELI3);
            assistantMessageElement.innerHTML = `<div class="structured-content ${isELI3 ? 'eli3-mode' : ''}">${renderedContent}</div>`;
            
            console.log('[LegalGuard] AI response rendered:', {
                userLanguage: this.userLanguage,
                outputLanguage: outputLanguage,
                wordCount: this.countWords(fullResponse),
                isELI3: isELI3
            });
            
            // Add to conversation history
            this.conversationHistory.push({ 
                role: 'assistant', 
                content: cleanedResponse,
                sourceLanguage: sourceLanguage,
                tone: tone,
                isStructured: true,
                isMarkdown: true
            });
            await this.saveConversationHistory();

        } catch (error) {
            console.error('[LegalGuard] AI response error:', error);
            assistantMessageElement.classList.remove('message-streaming');
            assistantMessageElement.innerHTML = '<div class="structured-content"><p>Sorry, I encountered an error. Please try again.</p></div>';
        } finally {
            this.isStreaming = false;
            this.syncPromptControls();
        }
    }

    createContextPrompt(userMessage) {
        let contextPrompt = `You are a helpful legal assistant. Your role is to explain legal terms and clauses in simple, understandable language. `;
        
        // Add page context if available
        if (this.currentData) {
            contextPrompt += `\n\nCurrent page context:\n`;
            if (this.currentData.pageSummary) {
                contextPrompt += `Page Summary: ${this.currentData.pageSummary}\n`;
            }
            if (this.currentData.categories) {
                const categories = Object.keys(this.currentData.categories).join(', ');
                contextPrompt += `Legal categories detected: ${categories}\n`;
            }
        }

        contextPrompt += `\n\nUser question: ${userMessage}`;
        
        return contextPrompt;
    }

    addMessage(role, content, isStreaming = false) {
        const messagesContainer = document.getElementById('messages');
        if (!messagesContainer) return null;

        // Remove empty state if it exists
        const emptyState = messagesContainer.querySelector('.empty-state');
        if (emptyState) {
            emptyState.remove();
        }

        const messageElement = document.createElement('div');
        messageElement.className = `message message-${role}`;
        if (isStreaming) {
            messageElement.classList.add('message-streaming');
        }
        messageElement.textContent = content;

        messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
        
        return messageElement;
    }

    scrollToBottom() {
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.scrollTop = messagesContainer.scrollHeight;
        }
    }

    addTranslationControls(messageElement, originalText, translatedText, role) {
        const controlsDiv = document.createElement('div');
        controlsDiv.className = 'translation-controls';
        
        const originalBtn = document.createElement('button');
        originalBtn.className = 'translation-btn';
        originalBtn.textContent = 'Original';
        originalBtn.addEventListener('click', () => {
            messageElement.innerHTML = originalText;
            originalBtn.classList.add('active');
            translatedBtn.classList.remove('active');
        });
        
        const translatedBtn = document.createElement('button');
        translatedBtn.className = 'translation-btn active';
        translatedBtn.textContent = 'Translated';
        translatedBtn.addEventListener('click', () => {
            messageElement.innerHTML = translatedText;
            translatedBtn.classList.add('active');
            originalBtn.classList.remove('active');
        });
        
        controlsDiv.appendChild(originalBtn);
        controlsDiv.appendChild(translatedBtn);
        
        // Set initial content to translated version (since Translated button is active by default)
        messageElement.innerHTML = translatedText;
        
        // Insert controls after the message
        messageElement.parentNode.insertBefore(controlsDiv, messageElement.nextSibling);
    }

    async loadLanguagePreferences() {
        try {
            const result = await chrome.storage.local.get(['lg:userLanguage', 'lg:autoTranslate']);
            this.userLanguage = result['lg:userLanguage'] || 'auto';
            this.autoTranslate = result['lg:autoTranslate'] !== false; // Default to true
            
            // Update UI
            const userLanguageSelect = document.getElementById('userLanguage');
            const autoTranslateCheckbox = document.getElementById('autoTranslate');
            
            if (userLanguageSelect) {
                userLanguageSelect.value = this.userLanguage;
            }
            if (autoTranslateCheckbox) {
                autoTranslateCheckbox.checked = this.autoTranslate;
            }
            
            // Only update translation status if the method exists
            if (typeof this.updateTranslationStatus === 'function') {
                this.updateTranslationStatus('Language preferences loaded');
            }
        } catch (error) {
            console.warn('[LegalGuard] Could not load language preferences:', error);
            // Set defaults if loading fails
            this.userLanguage = 'auto';
            this.autoTranslate = true;
        }
    }

    async saveLanguagePreferences() {
        try {
            await chrome.storage.local.set({
                'lg:userLanguage': this.userLanguage,
                'lg:autoTranslate': this.autoTranslate
            });
        } catch (error) {
            console.warn('[LegalGuard] Could not save language preferences:', error);
        }
    }

    async loadConversationHistory() {
        if (!this.currentTabId) return;

        try {
            const result = await chrome.storage.local.get([`lg:conversation:${this.currentTabId}`]);
            const history = result[`lg:conversation:${this.currentTabId}`] || [];
            
            this.conversationHistory = history;
            
            // Restore messages to UI
            const messagesContainer = document.getElementById('messages');
            if (messagesContainer && history.length > 0) {
                messagesContainer.innerHTML = '';
                
                history.forEach(msg => {
                    if (msg.isStructured) {
                        // Render structured content (Markdown or JSON)
                        const displayContent = (msg.translated && this.autoTranslate) ? msg.translated : msg.content;
                        const isELI3 = msg.tone === 'eli3';
                        
                        let renderedContent;
                        if (msg.isMarkdown) {
                            // Render as Markdown
                            renderedContent = this.renderMarkdown(displayContent, isELI3);
                            renderedContent = `<div class="structured-content ${isELI3 ? 'eli3-mode' : ''}">${renderedContent}</div>`;
                        } else {
                            // Render as JSON (legacy)
                            renderedContent = this.renderStructuredContent(displayContent, isELI3);
                        }
                        
                        const messageElement = this.addMessage(msg.role, '');
                        messageElement.innerHTML = renderedContent;
                        
                        // Add translation controls if message has translation
                        if (msg.translated && msg.translated !== msg.content) {
                            let originalRendered;
                            if (msg.isMarkdown) {
                                originalRendered = this.renderMarkdown(msg.content, isELI3);
                                originalRendered = `<div class="structured-content ${isELI3 ? 'eli3-mode' : ''}">${originalRendered}</div>`;
                            } else {
                                originalRendered = this.renderStructuredContent(msg.content, isELI3);
                            }
                            this.addTranslationControls(messageElement, originalRendered, renderedContent, msg.role);
                        }
                    } else {
                        // Show translated version if available and auto-translate is enabled
                        const displayContent = (msg.translated && this.autoTranslate) ? msg.translated : msg.content;
                        const messageElement = this.addMessage(msg.role, displayContent);
                        
                        // Add translation controls if message has translation
                        if (msg.translated && msg.translated !== msg.content) {
                            this.addTranslationControls(messageElement, msg.content, msg.translated, msg.role);
                        }
                    }
                });
            }
        } catch (error) {
            console.warn('[LegalGuard] Could not load conversation history:', error);
        }
    }

    async saveConversationHistory() {
        if (!this.currentTabId) return;

        try {
            await chrome.storage.local.set({
                [`lg:conversation:${this.currentTabId}`]: this.conversationHistory
            });
        } catch (error) {
            console.warn('[LegalGuard] Could not save conversation history:', error);
        }
    }

    async clearConversation() {
        this.conversationHistory = [];
        await this.saveConversationHistory();
        
        const messagesContainer = document.getElementById('messages');
        if (messagesContainer) {
            messagesContainer.innerHTML = `
                <div class="empty-state">
                    Start by highlighting a clause or asking a question below.<br>
                    <small>All processing happens locally on your device.</small>
                </div>
            `;
        }
    }

    async requestPageData() {
        try {
            if (!this.currentTabId) {
                this.showEmptyState('No active tab found');
                return;
            }

            console.log('[LegalGuard] Requesting data for tab:', this.currentTabId);

            // Get analysis data from storage first
            const result = await chrome.storage.local.get([`lg:analysis:${this.currentTabId}`]);
            const analysisData = result[`lg:analysis:${this.currentTabId}`];

            if (analysisData) {
                console.log('[LegalGuard] Found stored analysis data:', analysisData);
                this.currentData = analysisData;
                this.renderAnalysis();
            } else {
                // Try to get data from content script
                try {
                    // Check if content script is available first
                    const response = await chrome.tabs.sendMessage(this.currentTabId, { 
                        type: 'GET_HIGHLIGHTED_TERMS' 
                    });

                    if (response && response.success) {
                        console.log('[LegalGuard] Got highlighted terms from content script:', response.data);
                        this.currentData = response.data;
                        this.renderAnalysis();
                    } else {
                        console.log('[LegalGuard] Content script responded but no terms found');
                        this.showEmptyState('No legal terms detected on this page');
                    }
                } catch (error) {
                    console.warn('[LegalGuard] Could not get highlighted terms:', error);
                    
                    // Check if it's a connection error (content script not loaded)
                    if (error.message && error.message.includes('Could not establish connection')) {
                        console.log('[LegalGuard] Content script not loaded on this page');
                        this.showEmptyState('Content script not loaded - try refreshing the page');
                    } else {
                        // Other errors - just show empty state
                        this.showEmptyState('No legal terms detected on this page');
                    }
                }
            }
        } catch (error) {
            console.warn('[LegalGuard] Could not get page data:', error);
            this.showEmptyState('Unable to analyze this page');
        }
    }

    renderAnalysis() {
        if (!this.currentData) {
            this.showEmptyState('No analysis data available');
            return;
        }

        console.log('[LegalGuard] Rendering analysis:', this.currentData);

        // Render page summary
        this.renderPageSummary();
        
        // Render categories
        this.renderCategories();
        
        // Update highlight controls
        this.updateHighlightControls();
    }

    renderPageSummary() {
        const summaryElement = document.getElementById('pageSummary');
        if (!summaryElement) return;

        const { pageSummary, categories, totalTerms, foundTerms, detectedAt, detectionDetails } = this.currentData;
        
		summaryElement.innerHTML = `
			<p><strong>Analysis Summary:</strong></p>
			<p>${pageSummary || 'Legal terms analysis completed.'}</p>
			<p style="margin-top: 8px; font-size: 12px; color: #6b7280;">
				Found ${totalTerms || 0} legal terms across ${Object.keys(categories || {}).length} categories.
				${detectedAt ? `Detected at ${new Date(detectedAt).toLocaleTimeString()}` : ''}
			</p>
			<div id="summary-section" style="margin-top: 12px; padding: 8px; background: #f0f9ff; border-radius: 8px; font-size: 12px;">
				<em style="color: #64748b;">Generating page summary…</em>
			</div>
			${detectionDetails ? `
				<div style="margin-top: 8px; padding: 8px; background: #f0fdf4; border-radius: 8px; font-size: 12px;">
					<strong>Detection Details:</strong><br>
					Total: ${detectionDetails.totalDetections} terms<br>
					Categories: ${detectionDetails.categoriesFound.join(', ')}
				</div>
			` : ''}
		`;

		// Kick off AI summarization (non-blocking)
		this.generatePageSummaryWithAI().catch(() => {
			const container = document.getElementById('summary-section');
			if (container) {
				container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
			}
		});
    }

	async generatePageSummaryWithAI() {
        try {
            const container = document.getElementById('summary-section');
            if (!container) return;

            // Clear any pending retry to avoid duplicate timers
            if (this.summaryRetryTimer) {
                clearTimeout(this.summaryRetryTimer);
                this.summaryRetryTimer = null;
            }

            // Validate Summarizer API availability per Chrome docs
            if (!('Summarizer' in self) || typeof Summarizer.availability !== 'function') {
                container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
                return;
            }

            let summarizerAvailability = 'unavailable';
            try {
                summarizerAvailability = await Summarizer.availability();
            } catch (availabilityError) {
                console.warn('[LegalGuard] Summarizer availability check failed:', availabilityError);
            }

            if (summarizerAvailability === 'unavailable') {
                container.innerHTML = '<em style="color: #9ca3af;">Summary not available on this device.</em>';
                return;
            }

            if (summarizerAvailability === 'downloadable' || summarizerAvailability === 'downloading') {
                container.innerHTML = '<em style="color: #475569;">Downloading Chrome AI model (first-time setup)... Summary will refresh automatically once ready.</em>';
                // Re-check availability after a short delay
                this.summaryRetryTimer = setTimeout(() => {
                    this.generatePageSummaryWithAI().catch(() => {
                        const retryContainer = document.getElementById('summary-section');
                        if (retryContainer) {
                            retryContainer.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
                        }
                    });
                }, 8000);
                return;
            }

			// Retrieve page text from the content script
			let pageText = '';
			let pageLang = undefined;
			try {
				const response = await chrome.tabs.sendMessage(this.currentTabId, { type: 'GET_PAGE_TEXT' });
				if (response?.success && typeof response.text === 'string') {
					pageText = response.text;
				}
			} catch (e) {
				// ignore; will fallback below
			}

			// Try to get detected page language (for multilingual output)
			try {
				const langRes = await chrome.tabs.sendMessage(this.currentTabId, { type: 'GET_PAGE_LANG' });
				if (langRes?.success && typeof langRes.lang === 'string' && langRes.lang.length <= 5) {
					pageLang = langRes.lang;
				}
			} catch (e) {
				// optional
			}

			if (!pageText || pageText.trim().length < 50) {
				container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
				return;
			}

			// Create summarizer with medium length for ~100–150 words
			let summarizer;
			try {
				summarizer = await Summarizer.create({
					type: 'tldr',
					format: 'plain-text',
					length: 'medium',
					outputLanguage: pageLang,
					sharedContext: 'Act as a legal expert. Create a concise, informative summary (100–150 words) of the page focusing on key points, obligations, rights, risks, and notable legal implications. Use clear, neutral tone.'
				});
			} catch (e) {
				// If user activation is required, show a button to retry
				if (String(e?.message || '').toLowerCase().includes('activation') || String(e).toLowerCase().includes('gesture')) {
					container.innerHTML = '<button id="lg-generate-summary" style="all: unset; cursor: pointer; color: #2563eb;">Click to generate summary</button>';
					document.getElementById('lg-generate-summary')?.addEventListener('click', async () => {
						container.innerHTML = '<em style="color: #64748b;">Generating page summary…</em>';
						try {
							const s = await Summarizer.create({
								type: 'tldr',
								format: 'plain-text',
								length: 'medium',
								outputLanguage: pageLang,
								sharedContext: 'Act as a legal expert. Create a concise, informative summary (100–150 words) of the page focusing on key points, obligations, rights, risks, and notable legal implications. Use clear, neutral tone.'
							});
							const text = await s.summarize(pageText, { context: 'Remove boilerplate and navigation text. Focus on substantive content.' });
							container.textContent = (text || '').trim() || 'Summary not available';
						} catch (innerErr) {
							container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
						}
					});
					return;
				}
				container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
				return;
			}

			let summaryText = '';
			try {
				summaryText = await summarizer.summarize(pageText, {
					context: 'Remove boilerplate and navigation text. Focus on substantive content.'
				});
			} catch (e) {
				container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
				return;
			}

			if (!summaryText || !summaryText.trim()) {
				container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
				return;
			}

			// Insert the summary
			container.textContent = summaryText.trim();
		} catch (error) {
			const container = document.getElementById('summary-section');
			if (container) {
				container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
			}
		}
	}

    renderCategories() {
        const categoriesList = document.getElementById('categoriesList');
        if (!categoriesList) return;

        const { categories, detectionDetails } = this.currentData;
        
        if (!categories || Object.keys(categories).length === 0) {
            categoriesList.innerHTML = '<div class="empty-state">No legal terms detected on this page.</div>';
            return;
        }

        console.log('[LegalGuard] Rendering categories:', categories);

        const categoryIcons = {
            'Data & Privacy': '🔒',
            'Rights & Obligations': '⚖️',
            'Payment & Subscription': '💳',
            'Legal Risks & Disclaimer': '⚠️',
            'Intellectual Property': '📝',
            'User Conduct': '👤',
            'Miscellaneous': '📋'
        };

        const severityMap = {
            'Data & Privacy': 'high',
            'Rights & Obligations': 'high',
            'Payment & Subscription': 'medium',
            'Legal Risks & Disclaimer': 'medium',
            'Intellectual Property': 'medium',
            'User Conduct': 'low',
            'Miscellaneous': 'low'
        };

        categoriesList.innerHTML = Object.entries(categories).map(([category, terms]) => {
            const icon = categoryIcons[category] || '📋';
            const severity = severityMap[category] || 'low';
            const severityClass = `badge-${severity}`;
            const severityText = severity.charAt(0).toUpperCase() + severity.slice(1);

            // Show actual terms found in this category
            const uniqueTerms = [...new Set(terms)];
            const termsList = uniqueTerms.slice(0, 3).join(', ') + (uniqueTerms.length > 3 ? '...' : '');

            return `
                <div class="risk-item">
                    <span class="risk-icon">${icon}</span>
                    <div class="risk-content">
                        <div class="risk-header">
                            <span class="risk-name">${category}</span>
                            <span class="badge ${severityClass}">${severityText}</span>
                        </div>
                        <p class="risk-description">${terms.length} term${terms.length !== 1 ? 's' : ''} detected: ${termsList}</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateHighlightControls() {
        const controls = document.getElementById('highlightControls');
        if (!controls) return;

        const { totalTerms } = this.currentData;
        this.totalMatches = totalTerms || 0;

        if (this.totalMatches > 0) {
            controls.style.display = 'flex';
            this.updateMatchCounter();
        } else {
            controls.style.display = 'none';
        }
    }

    updateMatchCounter() {
        const counter = document.getElementById('matchCounter');
        if (counter) {
            counter.textContent = `${this.currentMatchIndex + 1} of ${this.totalMatches}`;
        }
    }

    async navigateMatch(direction) {
        try {
            if (!this.currentTabId) return;

            this.currentMatchIndex = Math.max(0, Math.min(this.currentMatchIndex + direction, this.totalMatches - 1));
            
            // Send message to content script to scroll to match
            await chrome.tabs.sendMessage(this.currentTabId, {
                type: 'SCROLL_TO_MATCH',
                index: this.currentMatchIndex
            });

            this.updateMatchCounter();
        } catch (error) {
            console.warn('[LegalGuard] Navigation failed:', error);
        }
    }

    async clearHighlights() {
        try {
            if (!this.currentTabId) return;

            await chrome.tabs.sendMessage(this.currentTabId, {
                type: 'CLEAR_HIGHLIGHTS'
            });

            this.currentMatchIndex = 0;
            this.updateMatchCounter();
        } catch (error) {
            console.warn('[LegalGuard] Clear highlights failed:', error);
        }
    }

    async loadMuteState() {
        try {
            if (!this.currentTabId) return;

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            const host = new URL(tab.url).host;
            const result = await chrome.storage.local.get([`lg:mute:${host}`]);
            const isMuted = result[`lg:mute:${host}`] === '1';
            
            this.updateMuteButton(isMuted);
        } catch (error) {
            console.warn('[LegalGuard] Could not load mute state:', error);
        }
    }

    async toggleMute(isMuted) {
        try {
            if (!this.currentTabId) return;

            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (!tab) return;

            const host = new URL(tab.url).host;
            const key = `lg:mute:${host}`;
            
            if (isMuted) {
                await chrome.storage.local.set({ [key]: '1' });
            } else {
                await chrome.storage.local.remove([key]);
            }

            this.updateMuteButton(isMuted);
            console.log(`[LegalGuard] Mute ${isMuted ? 'enabled' : 'disabled'} for ${host}`);
            return true;
        } catch (error) {
            console.warn('[LegalGuard] Could not toggle mute state:', error);
            await this.loadMuteState();
            return false;
        }
    }

    showEmptyState(message) {
        const categoriesList = document.getElementById('categoriesList');
        if (categoriesList) {
            categoriesList.innerHTML = `<div class="empty-state">${message}</div>`;
        }
        
        const controls = document.getElementById('highlightControls');
        if (controls) {
            controls.style.display = 'none';
        }
    }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => new LegalGuardSidePanel());
} else {
    new LegalGuardSidePanel();
}