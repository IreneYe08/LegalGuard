// glossary_toast.js — stable legal-terms detector + toast + highlight + sidepanel (patched)

if (
    location.protocol === 'chrome-extension:' ||
    location.hostname === 'chrome.google.com' ||
    document.contentType === 'application/pdf'
) {
    // do nothing on restricted pages
} else
    (async function () {
        // Load CSS first
        await loadToastCSS();

        async function loadToastCSS() {
            try {
                const url = chrome.runtime.getURL("css/toast.css");
                const res = await fetch(url, { cache: "no-store" });
                if (!res.ok) throw new Error(`CSS fetch failed: ${res.status}`);
                const css = await res.text();
                
                const style = document.createElement('style');
                style.textContent = css;
                document.head.appendChild(style);
                console.log('[LegalGuard] Toast CSS loaded');
            } catch (e) {
                console.error('[LegalGuard] Failed to load toast CSS', e);
            }
        }

        /* -------------------- Load glossary (JSON) -------------------- */
        async function loadGlossary() {
            try {
                // Try to load multilingual glossary first
                let url = chrome.runtime.getURL("glossary_multilingual.json");
                let res = await fetch(url, { cache: "no-store" });
                
                // Fallback to original glossary if multilingual not available
                if (!res.ok) {
                    console.log('[LegalGuard] Multilingual glossary not found, using original');
                    url = chrome.runtime.getURL("glossary_tri.json");
                    res = await fetch(url, { cache: "no-store" });
                }
                
                if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
                const json = await res.json();

                let arr;
                if (Array.isArray(json)) {
                    arr = json;
                } else if (json && Array.isArray(json.glossary)) {
                    arr = json.glossary;
                } else if (json && typeof json === "object") {
                    arr = Object.values(json);
                } else {
                    arr = [];
                }

                const safe = arr.slice().sort((a, b) => (b.term?.length || 0) - (a.term?.length || 0));
                console.log("[LegalGuard] glossary loaded:", { count: safe.length, first: safe[0] });
                return safe;
            } catch (e) {
                console.error("[LegalGuard] failed to load glossary", e);
                return [];
            }
        }

        /* -------------------- Detect page language -------------------- */
        function detectPageLanguage() {
            try {
                // Check HTML lang attribute
                const htmlLang = document.documentElement.lang;
                if (htmlLang) {
                    const lang = htmlLang.split('-')[0].toLowerCase();
                    console.log('[LegalGuard] Detected language from HTML lang:', lang);
                    return lang;
                }

                // Check meta language
                const metaLang = document.querySelector('meta[http-equiv="content-language"]');
                if (metaLang) {
                    const lang = metaLang.content.split('-')[0].toLowerCase();
                    console.log('[LegalGuard] Detected language from meta:', lang);
                    return lang;
                }

                // Check meta property
                const metaProp = document.querySelector('meta[property="og:locale"]');
                if (metaProp) {
                    const lang = metaProp.content.split('-')[0].toLowerCase();
                    console.log('[LegalGuard] Detected language from og:locale:', lang);
                    return lang;
                }

                // Analyze text content for language detection
                const textContent = document.body.innerText || '';
                const sampleText = textContent.slice(0, 1000);
                
                // Simple language detection based on common words
                const languagePatterns = {
                    'es': /\b(el|la|de|que|y|en|un|una|con|por|para|del|los|las|se|no|es|son|tiene|puede|debe|ser|estar|haber|tener|hacer|decir|ir|ver|saber|querer|venir|poder|dar|poner|salir|volver|tomar|traer|valer|saber|conocer|vivir|sentir|tratar|mirar|contar|empezar|esperar|buscar|existir|entrar|trabajar|escribir|subir|sufrir|desarrollar|conseguir|considerar|obtener|recordar|terminar|aceptar|realizar|suponer|comprender|lograr|explicar|preguntar|tocar|reconocer|estudiar|alcanzar|nacer|dirigir|correr|utilizar|pagar|ayudar|gustar|jugar|mover|ofrecer|conseguir|solicitar|aprender|producir|ofrecer|conocer|permitir)\b/i,
                    'fr': /\b(le|la|de|et|à|un|une|il|elle|nous|vous|ils|elles|est|sont|avoir|être|faire|dire|aller|voir|savoir|vouloir|venir|pouvoir|donner|mettre|sortir|revenir|prendre|apporter|valoir|connaître|vivre|sentir|traiter|regarder|compter|commencer|attendre|chercher|exister|entrer|travailler|écrire|monter|souffrir|développer|obtenir|considérer|se souvenir|terminer|accepter|réaliser|supposer|comprendre|réussir|expliquer|demander|toucher|reconnaître|étudier|atteindre|naître|diriger|courir|utiliser|payer|aider|aimer|jouer|bouger|offrir|obtenir|demander|apprendre|produire|offrir|connaître|permettre)\b/i,
                    'de': /\b(der|die|das|und|in|zu|den|von|mit|ist|sind|haben|sein|werden|können|sollen|müssen|wollen|mögen|dürfen|machen|gehen|kommen|sehen|wissen|sagen|geben|nehmen|finden|halten|lassen|stehen|liegen|sitzen|arbeiten|leben|denken|fühlen|helfen|sprechen|hören|lesen|schreiben|lernen|verstehen|erklären|fragen|antworten|suchen|finden|bekommen|kaufen|verkaufen|zahlen|kosten|bezahlen|sparen|verdienen|arbeiten|studieren|lehren|lernen|spielen|singen|tanzen|lachen|weinen|schlafen|essen|trinken|kochen|backen|waschen|putzen|reparieren|bauen|malen|zeichnen|fotografieren|filmen|reisen|fahren|fliegen|schwimmen|laufen|springen|klettern|fallen|steigen|sinken|wachsen|sterben|geboren|alt|jung|neu|alt|groß|klein|lang|kurz|breit|schmal|hoch|niedrig|tief|flach|schnell|langsam|früh|spät|heute|gestern|morgen|jetzt|dann|immer|nie|manchmal|oft|selten|oft|meist|wenig|viel|mehr|weniger|am meisten|am wenigsten|gut|schlecht|schön|hässlich|richtig|falsch|wahr|falsch|echt|unecht)\b/i,
                    'it': /\b(il|la|di|e|a|un|una|in|con|per|da|del|della|dei|delle|è|sono|ha|hanno|essere|avere|fare|dire|andare|vedere|sapere|volere|venire|potere|dare|mettere|uscire|tornare|prendere|portare|valere|conoscere|vivere|sentire|trattare|guardare|contare|iniziare|aspettare|cercare|esistere|entrare|lavorare|scrivere|salire|soffrire|sviluppare|ottenere|considerare|ricordare|terminare|accettare|realizzare|supporre|comprendere|riuscire|spiegare|chiedere|toccare|riconoscere|studiare|raggiungere|nascere|dirigere|correre|utilizzare|pagare|aiutare|piacere|giocare|muovere|offrire|ottenere|richiedere|imparare|produrre|offrire|conoscere|permettere)\b/i,
                    'pt': /\b(o|a|de|e|em|um|uma|com|por|para|do|da|dos|das|é|são|tem|têm|ser|estar|ter|fazer|dizer|ir|ver|saber|querer|vir|poder|dar|colocar|sair|voltar|tomar|trazer|valer|conhecer|viver|sentir|tratar|olhar|contar|começar|esperar|procurar|existir|entrar|trabalhar|escrever|subir|sofrer|desenvolver|conseguir|considerar|obter|lembrar|terminar|aceitar|realizar|supor|compreender|conseguir|explicar|perguntar|tocar|reconhecer|estudar|alcançar|nascer|dirigir|correr|utilizar|pagar|ajudar|gostar|jogar|mover|oferecer|conseguir|solicitar|aprender|produzir|oferecer|conhecer|permitir)\b/i
                };

                let maxMatches = 0;
                let detectedLang = 'en';

                for (const [lang, pattern] of Object.entries(languagePatterns)) {
                    const matches = (sampleText.match(pattern) || []).length;
                    if (matches > maxMatches) {
                        maxMatches = matches;
                        detectedLang = lang;
                    }
                }

                console.log('[LegalGuard] Detected language from content:', detectedLang, 'with', maxMatches, 'matches');
                return detectedLang;
            } catch (e) {
                console.warn('[LegalGuard] Language detection failed:', e);
                return 'en';
            }
        }

        /* -------------------- Utils & State -------------------- */
        const ESC = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const mkPattern = arr => {
            const combined = arr.join('|');
            return new RegExp(combined, 'i');
        };

        const isVisible = node => {
            const el = node.nodeType === 3 ? node.parentElement : node;
            if (!el) return false;
            const style = window.getComputedStyle(el);
            if (!style || style.visibility === 'hidden' || style.display === 'none')
                return false;
            const rect = el.getBoundingClientRect();
            return !(rect.width === 0 || rect.height === 0);
        };

        const shouldSkip = el => {
            const tag = (el.tagName || '').toLowerCase();
            return (
                ['script', 'style', 'noscript', 'template', 'textarea', 'input', 'select'].includes(
                    tag
                ) || el.isContentEditable
            );
        };

        const hrefNoHash = () => location.origin + location.pathname + location.search;
        const now = () => Date.now();

        let currentPageKey = hrefNoHash();
        let LG_SEEN = new Set(
            JSON.parse(sessionStorage.getItem('lg:seen:' + currentPageKey) || '[]')
        );
        let LG_TOAST_COUNT = 0;
        const LG_MAX_TOAST_PER_PAGE = 2;
        let LG_COOLDOWN_UNTIL = 0;
        const LG_COOLDOWN_MS = 15000;

        const saveSeen = () =>
            sessionStorage.setItem('lg:seen:' + currentPageKey, JSON.stringify([...LG_SEEN]));

        const resetPageState = () => {
            LG_SEEN = new Set(
                JSON.parse(sessionStorage.getItem('lg:seen:' + currentPageKey) || '[]')
            );
            LG_TOAST_COUNT = 0;
            LG_COOLDOWN_UNTIL = 0;
        };

        /* -------------------- Toast UI -------------------- */
        function ensureToastRoot() {
            let root = document.querySelector('.lg-toast-wrapper');
            if (!root) {
                root = document.createElement('div');
                root.className = 'lg-toast-wrapper';
                document.documentElement.appendChild(root);
            }
            return root;
        }

        function ensureToastCSS() {
            if (document.getElementById('lg-toast-styles')) return;
            
            const style = document.createElement('style');
            style.id = 'lg-toast-styles';
            style.textContent = `
                .lg-toast-wrapper {
                    position: fixed;
                    top: 24px;
                    right: 24px;
                    z-index: 2147483647;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                }
                .lg-toast {
                    background: white;
                    border: 1px solid #e5e7eb;
                    border-radius: 16px;
                    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 10px 10px -5px rgba(0, 0, 0, 0.04);
                    width: 384px;
                    padding: 16px;
                    animation: lg-slideDown 0.3s ease-out;
                }
                @keyframes lg-slideDown {
                    from { opacity: 0; transform: translateY(-20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
                .lg-toast-content { display: flex; gap: 12px; align-items: flex-start; }
                .lg-toast-icon {
                    flex-shrink: 0; width: 40px; height: 40px; border-radius: 50%;
                    background: #eff6ff; display: flex; align-items: center; justify-content: center; color: #3b82f6;
                }
                .lg-toast-body { flex: 1; min-width: 0; }
                .lg-toast-title { font-size: 14px; font-weight: 600; color: #111827; margin: 0 0 4px 0; line-height: 1.4; }
                .lg-toast-message { font-size: 14px; color: #6b7280; line-height: 1.5; margin: 0 0 12px 0; }
                .lg-toast-actions { display: flex; gap: 8px; margin-bottom: 12px; }
                .lg-btn {
                    padding: 6px 14px; border-radius: 8px; font-size: 13px; font-weight: 500;
                    border: none; cursor: pointer; transition: all 0.15s; font-family: inherit;
                }
                .lg-btn-primary { background: #3b82f6; color: white; }
                .lg-btn-primary:hover { background: #2563eb; transform: translateY(-1px); }
                .lg-btn-primary:active { transform: translateY(0); }
                .lg-btn-ghost { background: transparent; color: #6b7280; }
                .lg-btn-ghost:hover { background: #f3f4f6; color: #111827; }
                .lg-toast-dismiss {
                    display: flex; align-items: center; gap: 6px; background: none; border: none;
                    font-size: 12px; color: #9ca3af; cursor: pointer; padding: 0; font-family: inherit;
                }
                .lg-toast-dismiss:hover { color: #111827; }
                .lg-toast-close {
                    flex-shrink: 0; background: none; border: none; color: #9ca3af;
                    cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;
                }
                .lg-toast-close:hover { color: #111827; }
            `;
            document.head.appendChild(style);
        }

        function getToastCopy(found) {
            const title = 'Legal terms detected';
            let subtitle = 'Review key restrictions before you proceed.';
            const map = {
                'rights_&_obligations': 'Legal obligations detected — review liability and responsibilities.',
                'data_&_privacy': 'Privacy terms detected — check data collection and sharing.',
                'payment_&_subscription': 'Payment terms detected — review fees, refund, and renewal.',
                'legal_risks_&_disclaimer': 'Legal risks detected — check limitations and disclaimers.',
                'intellectual_property': 'IP terms detected — check usage rights and ownership.',
                'user_conduct': 'User conduct rules detected — review acceptable use policies.',
                'miscellaneous': 'Legal terms detected — review key restrictions before you proceed.'
            };
            const key = (found?.cat || '').toLowerCase().replace(/\s+/g, '_');
            if (map[key]) subtitle = map[key];
            return { title, subtitle };
        }

        function ensureHighlightStyle() {
            if (document.getElementById('lg-mark-style')) return;
            const s = document.createElement('style');
            s.id = 'lg-mark-style';
            s.textContent = `
                .lg-mark {
                    background:#fff3a1;
                    padding:0 2px;
                    border-radius:2px;
                    box-shadow:0 0 0 1px rgba(0,0,0,.04) inset;
                }
            `;
            document.head.appendChild(s);
        }

        // 高亮所有类别的关键词
        function highlightAllTerms(allPatterns) {
            if (!allPatterns || allPatterns.length === 0) {
                console.warn('[LegalGuard] No patterns to highlight');
                return 0;
            }

            console.log('[LegalGuard] Starting highlight with', allPatterns.length, 'patterns');
            ensureHighlightStyle();

            let combinedRe;
            try {
                const allPatternsStr = allPatterns.join('|');
                combinedRe = new RegExp(allPatternsStr, 'gi');
            } catch (e) {
                console.error('[LegalGuard] Invalid combined regex pattern:', e);
                return 0;
            }

            let hits = 0;
            const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                acceptNode(node) {
                    const p = node.parentElement;
                    if (!p || shouldSkip(p) || !isVisible(node)) return NodeFilter.FILTER_REJECT;
                    if (!node.nodeValue || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
                    return NodeFilter.FILTER_ACCEPT;
                }
            });

            const toProcess = [];
            let node;
            while ((node = walker.nextNode())) {
                if (combinedRe.test(node.nodeValue)) {
                    toProcess.push(node);
                    combinedRe.lastIndex = 0;
                }
            }

            console.log('[LegalGuard] Found', toProcess.length, 'text nodes to process');

            for (const node of toProcess) {
                const frag = document.createDocumentFragment();
                let lastIndex = 0;
                const text = node.nodeValue;

                combinedRe.lastIndex = 0;
                let match;
                while ((match = combinedRe.exec(text)) !== null) {
                    if (match.index > lastIndex) {
                        frag.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
                    }

                    const mark = document.createElement('mark');
                    mark.className = 'lg-mark';
                    mark.textContent = match[0];
                    frag.appendChild(mark);

                    lastIndex = match.index + match[0].length;
                    hits++;

                    if (match.index === combinedRe.lastIndex) {
                        combinedRe.lastIndex++;
                    }
                }

                if (lastIndex < text.length) {
                    frag.appendChild(document.createTextNode(text.slice(lastIndex)));
                }

                node.parentNode.replaceChild(frag, node);
            }

            const first = document.querySelector('.lg-mark');
            if (first && first.scrollIntoView) {
                first.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }

            console.log(`[LegalGuard] Highlighted ${hits} legal terms across all categories`);
            return hits;
        }

        // ---- messaging helper to prep side panel ----
        function prepSidePanelViaBG() {
            return new Promise((resolve) => {
                try {
                    if (!chrome?.runtime?.sendMessage) {
                        resolve({ success: false, error: 'runtime.sendMessage unavailable' });
                        return;
                    }
                    chrome.runtime.sendMessage({ action: 'prepSidePanel' }, (resp) => {
                        const lastError = chrome.runtime.lastError;
                        if (lastError) {
                            resolve({ success: false, error: lastError.message });
                            return;
                        }
                        if (!resp) {
                            resolve({ success: false, error: 'no response from background' });
                            return;
                        }
                        resolve(resp);
                    });
                } catch (e) {
                    resolve({ success: false, error: e?.message || String(e) });
                }
            });
        }

        function isRuntimeAvailable() {
            return typeof chrome !== 'undefined' &&
                !!chrome.runtime?.id &&
                typeof chrome.runtime.sendMessage === 'function';
        }

        function safeRuntimeSendMessage(message, callback) {
            const label = message?.type || message?.action || 'unknown';

            if (!isRuntimeAvailable()) {
                console.warn(`[LegalGuard] Runtime unavailable for message ${label}; skipping send`);
                if (typeof callback === 'function') {
                    callback({ success: false, error: 'runtimeUnavailable' });
                }
                return;
            }

            try {
                chrome.runtime.sendMessage(message, (...args) => {
                    if (typeof callback === 'function') {
                        callback(...args);
                    }
                });
            } catch (error) {
                console.warn(`[LegalGuard] Runtime message failed for ${label}:`, error);
                if (typeof callback === 'function') {
                    callback({ success: false, error: error?.message || String(error) });
                }
            }
        }

        function showToast({ title, subtitle, allPatterns }) {
            console.log('[LegalGuard] showToast called with:', { title, subtitle });
            
            const root = ensureToastRoot();
            console.log('[LegalGuard] Toast root element:', root);
            
            root.innerHTML = '';
            const el = document.createElement('div');
            el.className = 'lg-toast';
            el.innerHTML = `
                <div class="lg-toast-content">
                    <div class="lg-toast-icon">🛡️</div>
                    <div class="lg-toast-body">
                        <div class="lg-toast-title">${title}</div>
                        <div class="lg-toast-message">${subtitle}</div>
                        <div class="lg-toast-actions">
                            <button class="lg-btn lg-btn-primary" id="lg-primary">Highlight key risks</button>
                            <button class="lg-btn lg-btn-ghost" id="lg-secondary">[Prepare for full analysis]</button>
                        </div>
                        <div class="lg-toast-hint" style="font-size: 12px; color: #666; margin-top: 8px; text-align: center;">
                            💡 Tip: You can also open it from the Chrome extension panel.
                        </div>
                        <button class="lg-toast-dismiss" id="lg-mute">Dismiss for this site</button>
                    </div>
                    <button class="lg-toast-close" id="lg-close">✕</button>
                </div>
            `;
            root.appendChild(el);
            
            console.log('[LegalGuard] Toast element created and appended:', el);
            console.log('[LegalGuard] Toast element computed style:', window.getComputedStyle(el));

            const close = () => { root.innerHTML = ''; };
            el.querySelector('#lg-close').onclick = close;
            el.querySelector('#lg-mute').onclick = () => { try { localStorage.setItem('lg:mute:' + location.host, '1'); } catch { } close(); };

            // Update the highlight button click handler to store ALL highlighted terms
            el.querySelector('#lg-primary').onclick = () => {
                console.log('[LegalGuard] Highlight button clicked');
                const count = highlightAllTerms(allPatterns);
                const btn = el.querySelector('#lg-primary');
                if (btn && count > 0) {
                    btn.textContent = `Highlighted ${count} term${count > 1 ? 's' : ''}`;
                    btn.disabled = true;
                    btn.style.opacity = '0.7';
                    
                    // Store the actual highlighted terms for the side panel
                    updateDetectionResultsFromHighlights();
                } else if (btn) {
                    btn.textContent = 'No terms found';
                    btn.disabled = true;
                    btn.style.opacity = '0.7';
                }
            };

            // Add this function to collect data from all highlighted terms
            function updateDetectionResultsFromHighlights() {
                const highlightedElements = document.querySelectorAll('.lg-mark');
                console.log('[LegalGuard] Found highlighted elements:', highlightedElements.length);
                
                // Reset the detection results
                currentDetectionResults = {
                    foundTerms: [],
                    categories: {},
                    totalTerms: 0,
                    pageSummary: '',
                    detectedAt: new Date().toISOString()
                };
                
                // Collect data from all highlighted terms
                highlightedElements.forEach((element, index) => {
                    const text = element.textContent;
                    const category = determineCategoryFromText(text);
                    
                    // Add to found terms
                    currentDetectionResults.foundTerms.push({
                        cat: category,
                        phrase: text,
                        pattern: text,
                        context: text,
                        node: element,
                        index: index
                    });
                    
                    // Add to categories
                    if (!currentDetectionResults.categories[category]) {
                        currentDetectionResults.categories[category] = [];
                    }
                    currentDetectionResults.categories[category].push(text);
                    
                    currentDetectionResults.totalTerms++;
                });
                
                console.log('[LegalGuard] Updated detection results:', currentDetectionResults);
            }

            // Helper function to determine category from highlighted text
            function determineCategoryFromText(text) {
                // Check which category this text belongs to
                for (const [category, patterns] of Object.entries(byCat)) {
                    for (const pattern of patterns) {
                        try {
                            const regex = new RegExp(pattern, 'i');
                            if (regex.test(text)) {
                                return category;
                            }
                        } catch (e) {
                            console.warn('[LegalGuard] Invalid pattern:', pattern, e);
                        }
                    }
                }
                return 'Miscellaneous';
            }

            const secondaryButton = el.querySelector('#lg-secondary');
            if (secondaryButton && !secondaryButton.dataset.lgPointerbound) {
                secondaryButton.dataset.lgPointerbound = 'true';
                secondaryButton.addEventListener('pointerdown', () => {
                    if (!isRuntimeAvailable()) {
                        console.warn('[LegalGuard] Runtime unavailable during pointerdown; prompting user to use extension icon');
                        const btn = el.querySelector('#lg-secondary');
                        if (btn) {
                            btn.textContent = '⚠️ Click extension icon for full analysis';
                            btn.style.background = '#f59e0b';
                            btn.style.color = 'white';
                            btn.style.fontWeight = 'bold';
                        }
                        return;
                    }

                    safeRuntimeSendMessage({
                        type: 'OPEN_SIDE_PANEL',
                        source: 'toast'
                    });
                });
            }

            // Update the button click handler to store the actual detection results
            el.querySelector('#lg-secondary').onclick = () => {
                console.log('[LegalGuard] Opening side panel for full analysis');

                if (!isRuntimeAvailable()) {
                    console.warn('[LegalGuard] Runtime unavailable; cannot open side panel from toast click');
                    const btn = el.querySelector('#lg-secondary');
                    if (btn) {
                        btn.textContent = '⚠️ Click extension icon to view results';
                        btn.style.background = '#f59e0b';
                        btn.style.color = 'white';
                        btn.style.fontWeight = 'bold';
                    }
                    return;
                }

                // First prep the side panel
                safeRuntimeSendMessage({ 
                    action: 'prepSidePanel'
                }, (prepResponse) => {
                    if (prepResponse?.success) {
                        console.log('[LegalGuard] Side panel prepped successfully');
                        
                        // Update button to be more prominent
                        const btn = el.querySelector('#lg-secondary');
                        if (btn) {
                            btn.textContent = '✅ Click extension icon to see full analysis';
                            btn.style.background = '#10b981';
                            btn.style.color = 'white';
                            btn.style.fontWeight = 'bold';
                        }
                        
                        // Send ACTUAL detection results to side panel
                        setTimeout(() => {
                            const analysisData = {
                                pageSummary: generatePageSummary(),
                                categories: getDetectedCategories(),
                                totalTerms: getTotalTerms(),
                                sampleSnippets: getSampleSnippets(),
                                foundTerms: currentDetectionResults.foundTerms,
                                detectedAt: currentDetectionResults.detectedAt,
                                // Add more detailed information
                                detectionDetails: {
                                    totalDetections: currentDetectionResults.totalTerms,
                                    categoriesFound: Object.keys(currentDetectionResults.categories),
                                    lastDetection: currentDetectionResults.detectedAt,
                                    allTerms: currentDetectionResults.foundTerms.map(term => ({
                                        category: term.cat,
                                        phrase: term.phrase,
                                        pattern: term.pattern,
                                        context: term.context
                                    }))
                                }
                            };
                            
                            console.log('[LegalGuard] Sending analysis data to side panel:', analysisData);
                            
                            safeRuntimeSendMessage({
                                action: 'analysisComplete',
                                data: analysisData
                            });
                        }, 300);
                        
                    } else {
                        console.warn('[LegalGuard] Side panel prep failed:', prepResponse?.error);
                        const btn = el.querySelector('#lg-secondary');
                        if (btn) {
                            btn.textContent = '❌ Failed - try extension icon';
                            btn.style.background = '#ef4444';
                            btn.style.color = 'white';
                        }
                    }
                });
            };
            // Toast 不会自动关闭
        }

        /* -------------------- Main detection -------------------- */
        const glossary = await loadGlossary();
        if (!glossary || glossary.length === 0) {
            console.warn('[LegalGuard] No glossary items loaded');
            return;
        }

        // Detect page language
        const pageLanguage = detectPageLanguage();
        console.log('[LegalGuard] Page language detected:', pageLanguage);

        // Filter glossary by language (include English terms and terms matching page language)
        const filteredGlossary = glossary.filter(item => {
            if (!item || !item.term) return false;
            // Always include English terms as fallback
            if (!item.language || item.language === 'en') return true;
            // Include terms matching the detected page language
            return item.language === pageLanguage;
        });

        console.log('[LegalGuard] Filtered glossary:', {
            total: glossary.length,
            filtered: filteredGlossary.length,
            language: pageLanguage
        });

        const allPatterns = filteredGlossary.map(item => item.term).filter(Boolean);
        console.log('[LegalGuard] Total patterns loaded:', allPatterns.length);

        try {
            if (localStorage.getItem('lg:mute:' + location.host) === '1') return;
        } catch { }

        const byCat = filteredGlossary.reduce((acc, item) => {
            if (!item || !item.term) return acc;
            const cat = item.category || 'Miscellaneous';
            (acc[cat] ||= []).push(item.term);
            return acc;
        }, {});

        const matchers = Object.entries(byCat).map(([cat, patterns]) => {
            return { cat, patterns, re: mkPattern(patterns) };
        });

        console.log('[LegalGuard] Matchers created:', matchers.length);

        let currentDetectionResults = {
            foundTerms: [],
            categories: {},
            totalTerms: 0,
            pageSummary: '',
            detectedAt: null
        };

        function scanOnce() {
            console.log('[LegalGuard] scanOnce called');
            const ts = now();
            if (ts < LG_COOLDOWN_UNTIL) {
                console.log('[LegalGuard] Still in cooldown period');
                return;
            }
            if (LG_TOAST_COUNT >= LG_MAX_TOAST_PER_PAGE) {
                console.log('[LegalGuard] Max toasts per page reached');
                return;
            }

            let found = null;
            try {
                const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
                    acceptNode: node => {
                        const p = node.parentElement;
                        if (!p || shouldSkip(p)) return NodeFilter.FILTER_REJECT;
                        const t = node.nodeValue;
                        if (!t || !t.trim()) return NodeFilter.FILTER_REJECT;
                        return NodeFilter.FILTER_ACCEPT;
                    }
                });

                while (!found) {
                    const node = walker.nextNode();
                    if (!node) break;
                    if (!isVisible(node)) continue;

                    const text = node.nodeValue;
                    for (const { cat, patterns, re } of matchers) {
                        const m = text.match(re);
                        if (m) {
                            let matchedPattern = null;
                            for (const pattern of patterns) {
                                try {
                                    const testRe = new RegExp(pattern, 'i');
                                    if (testRe.test(text)) { matchedPattern = pattern; break; }
                                } catch (e) {
                                    console.warn('[LegalGuard] Invalid pattern:', pattern, e);
                                }
                            }
                            if (!matchedPattern) matchedPattern = patterns[0];

                            const idx = m.index || 0;
                            const start = Math.max(0, idx - 40);
                            const end = Math.min(text.length, idx + m[0].length + 40);
                            const snippet = text.slice(start, end).replace(/\s+/g, ' ');

                            found = { cat, phrase: m[0], pattern: matchedPattern, context: snippet, node };
                            break;
                        }
                    }
                }
            } catch (e) {
                console.warn('[LegalGuard] scan error', e);
            }

            if (found) {
                console.log('[LegalGuard] Found legal term:', found);
                const key = `${found.cat}|${found.pattern}`;
                if (LG_SEEN.has(key)) return;
                LG_SEEN.add(key);
                saveSeen();

                LG_TOAST_COUNT++;
                LG_COOLDOWN_UNTIL = now() + LG_COOLDOWN_MS;

                // Store the actual detection result
                currentDetectionResults.foundTerms.push(found);
                currentDetectionResults.categories[found.cat] = currentDetectionResults.categories[found.cat] || [];
                currentDetectionResults.categories[found.cat].push(found.phrase);
                currentDetectionResults.totalTerms++;
                currentDetectionResults.detectedAt = new Date().toISOString();

                const copy = getToastCopy(found);
                showToast({ title: copy.title, subtitle: copy.subtitle, allPatterns });
                console.log('[LegalGuard] Toast shown:', { category: found.cat, phrase: found.phrase, pattern: found.pattern });
            } else {
                console.log('[LegalGuard] No legal terms found in this scan');
            }
        }

        /* -------------------- Stability layer -------------------- */
        function hashStr(s) { let h = 5381, i = s.length; while (i) h = (h * 33) ^ s.charCodeAt(--i); return (h >>> 0).toString(36); }
        function bodySignature() { const t = document.body ? document.body.innerText || '' : ''; const len = t.length, head = t.slice(0, 2000); return `${len}:${hashStr(head)}`; }

        let scheduleTimer = null, lastScanAt = 0, lastSig = '';
        const SCAN_DEBOUNCE = 900;
        const SCAN_MIN_INTERVAL = 4000;

        function scheduleScan(reason = 'unknown') {
            const nowTs = Date.now();
            if (nowTs - lastScanAt < SCAN_MIN_INTERVAL) return;
            clearTimeout(scheduleTimer);
            scheduleTimer = setTimeout(() => {
                const sig = bodySignature();
                if (sig && sig !== lastSig) {
                    lastSig = sig;
                    lastScanAt = Date.now();
                    scanOnce();
                }
            }, SCAN_DEBOUNCE);
        }

        if (document.readyState === 'complete') {
            scheduleScan('initial-complete');
        } else {
            window.addEventListener('DOMContentLoaded', () => scheduleScan('domcontent'));
            window.addEventListener('load', () => scheduleScan('load'));
        }

        const mo = new MutationObserver(muts => {
            let addedTextChars = 0;
            for (const m of muts) {
                if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
                    m.addedNodes.forEach(n => {
                        if (n.nodeType === 3) addedTextChars += (n.nodeValue || '').trim().length;
                        else if (n.nodeType === 1) {
                            const el = /** @type {Element} */ (n);
                            const txt = el.innerText;
                            if (txt && txt.length) addedTextChars += Math.min(txt.length, 2000);
                        }
                    });
                }
            }
            if (addedTextChars >= 100) scheduleScan('mo');
        });
        mo.observe(document.documentElement, { childList: true, subtree: true });

        (function patchHistory() {
            const push = history.pushState, rep = history.replaceState;
            function wrap(fn) {
                return function (...a) {
                    const r = fn.apply(this, a);
                    const newKey = hrefNoHash();
                    if (newKey !== currentPageKey) {
                        currentPageKey = newKey;
                        resetPageState();
                        lastSig = '';
                    }
                    scheduleScan('history');
                    return r;
                };
            }
            history.pushState = wrap(push);
            history.replaceState = wrap(rep);
            window.addEventListener('popstate', () => {
                const newKey = hrefNoHash();
                if (newKey !== currentPageKey) {
                    currentPageKey = newKey;
                    resetPageState();
                    lastSig = '';
                }
                scheduleScan('popstate');
            });
        })();

        // Message handling for side panel communication
        if (chrome.runtime.onMessage) {
            chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
                if (request.type === 'GET_ANALYSIS_DATA') {
                    // Return current analysis data
                    const analysisData = {
                        pageSummary: generatePageSummary(),
                        categories: getDetectedCategories(),
                        totalTerms: getTotalTerms(),
                        sampleSnippets: getSampleSnippets()
                    };
                    sendResponse({ success: true, data: analysisData });
                    return true;
                }
                
                if (request.type === 'SCROLL_TO_MATCH') {
                    scrollToMatch(request.index);
                    sendResponse({ success: true });
                    return true;
                }
                
                if (request.type === 'CLEAR_HIGHLIGHTS') {
                    clearAllHighlights();
                    sendResponse({ success: true });
                    return true;
                }

                if (request.type === 'GET_HIGHLIGHTED_TERMS') {
                    // Get all highlighted terms from the page
                    const highlightedElements = document.querySelectorAll('.lg-mark');
                    const highlightedTerms = Array.from(highlightedElements).map((element, index) => ({
                        text: element.textContent,
                        index: index
                    }));
                    
                    // Group by category
                    const categories = {};
                    highlightedTerms.forEach(term => {
                        const category = determineCategoryFromText(term.text);
                        if (!categories[category]) {
                            categories[category] = [];
                        }
                        categories[category].push(term.text);
                    });
                    
                    const analysisData = {
                        pageSummary: `Found ${highlightedTerms.length} highlighted legal terms on this page.`,
                        categories: categories,
                        totalTerms: highlightedTerms.length,
                        foundTerms: highlightedTerms,
                        detectedAt: new Date().toISOString()
                    };
                    
                    sendResponse({ success: true, data: analysisData });
                    return true;
                }
                
                if (request.type === 'GET_PAGE_TEXT') {
                    try {
                        const raw = document.body?.innerText || '';
                        // Limit to avoid oversized messages; keep enough for summarization
                        const MAX_CHARS = 120000;
                        const text = raw.length > MAX_CHARS ? raw.slice(0, MAX_CHARS) : raw;
                        sendResponse({ success: true, text });
                    } catch (e) {
                        sendResponse({ success: false, error: e?.message || 'Failed to read page text' });
                    }
                    return true;
                }

                if (request.type === 'GET_PAGE_LANG') {
                    try {
                        const lang = (typeof detectPageLanguage === 'function') ? detectPageLanguage() : (document.documentElement.lang || 'en').split('-')[0].toLowerCase();
                        sendResponse({ success: true, lang });
                    } catch (e) {
                        sendResponse({ success: false, lang: 'en' });
                    }
                    return true;
                }
                
                // Handle unknown request types
                sendResponse({ success: false, error: 'Unknown request type' });
                return true;
            });
        }

        // Helper functions for side panel
        function generatePageSummary() {
            const host = location.hostname;
            const title = document.title;
            const termCount = currentDetectionResults.totalTerms;
            const categoryCount = Object.keys(currentDetectionResults.categories).length;
            
            return `Analysis of ${title} on ${host}. Found ${termCount} legal terms across ${categoryCount} categories. Review the detected terms below.`;
        }

        function getDetectedCategories() {
            // Return the actual categories that were found
            return currentDetectionResults.categories;
        }

        function getTotalTerms() {
            return currentDetectionResults.totalTerms;
        }

        function getSampleSnippets() {
            // Return actual snippets from found terms
            return currentDetectionResults.foundTerms.map(term => ({
                category: term.cat,
                phrase: term.phrase,
                context: term.context
            }));
        }

        function scrollToMatch(index) {
            const highlights = document.querySelectorAll('.lg-mark');
            if (highlights[index]) {
                highlights[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
            }
        }

        function clearAllHighlights() {
            const highlights = document.querySelectorAll('.lg-mark');
            highlights.forEach(highlight => {
                const parent = highlight.parentNode;
                parent.replaceChild(document.createTextNode(highlight.textContent), highlight);
                parent.normalize();
            });
        }
    })();
