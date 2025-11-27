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
        this.downloadRetryCount = 0;
        this.maxDownloadRetries = 3;
        this.downloadMonitor = null;
        this.downloadTimeout = null;
        this.stallCheckTimeout = null;
        
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
        
        // Check for selected text from context menu and auto-fill
        await this.checkForSelectedText();
    }

    cacheUIElements() {
        this.elements = {
            sendBtn: document.getElementById('send-btn'),
            chatInput: document.getElementById('chat-input'),
            modelOverlay: document.getElementById('modelDownloadOverlay'),
            modelOverlayMessage: document.getElementById('modelDownloadMessage'),
            modelDownloadProgress: document.getElementById('modelDownloadProgress'),
            modelDownloadProgressContainer: document.getElementById('modelDownloadProgressContainer'),
            modelDownloadProgressText: document.getElementById('modelDownloadProgressText'),
            modelDownloadSpinner: document.getElementById('modelDownloadSpinner'),
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

    updateModelDownloadUI(status, message, progress = null) {
        this.modelStatus = status;
        const { 
            modelOverlay, 
            modelOverlayMessage, 
            modelDownloadProgress, 
            modelDownloadProgressContainer,
            modelDownloadProgressText,
            modelDownloadSpinner
        } = this.elements;

        if (modelOverlayMessage && typeof message === 'string') {
            modelOverlayMessage.innerHTML = message;
        }

        // Handle progress bar visibility and state
        if (modelDownloadProgressContainer) {
            if (status === 'downloading' && progress !== null) {
                // Show progress bar with specific progress
                modelDownloadProgressContainer.style.display = 'block';
                if (modelDownloadProgress) {
                    modelDownloadProgress.value = progress;
                    // Ensure value attribute is set (not indeterminate)
                    modelDownloadProgress.setAttribute('value', progress.toString());
                }
                if (modelDownloadProgressText) {
                    const percent = Math.round(progress * 100);
                    modelDownloadProgressText.textContent = `${percent}% complete`;
                }
                // Hide spinner when showing progress bar
                if (modelDownloadSpinner) {
                    modelDownloadSpinner.style.display = 'none';
                }
            } else if (status === 'preparing') {
                // Show indeterminate progress (extracting/loading)
                modelDownloadProgressContainer.style.display = 'block';
                if (modelDownloadProgress) {
                    // Remove value attribute to make progress bar indeterminate
                    modelDownloadProgress.removeAttribute('value');
                }
                if (modelDownloadProgressText) {
                    modelDownloadProgressText.textContent = 'Preparing model...';
                }
                // Show spinner for preparing state
                if (modelDownloadSpinner) {
                    modelDownloadSpinner.style.display = 'block';
                }
            } else {
                // Hide progress bar
                modelDownloadProgressContainer.style.display = 'none';
                if (modelDownloadProgress) {
                    modelDownloadProgress.value = 0;
                    // Ensure value attribute exists (not indeterminate)
                    modelDownloadProgress.setAttribute('value', '0');
                }
                if (modelDownloadProgressText) {
                    modelDownloadProgressText.textContent = '';
                }
                // Show spinner for other downloading states
                if (modelDownloadSpinner) {
                    modelDownloadSpinner.style.display = status === 'downloading' ? 'block' : 'none';
                }
            }
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

    // Get consistent options for LanguageModel API
    // CRITICAL: Always pass the same options to availability() and create()
    getLanguageModelOptions() {
        return {
            expectedInputs: [{ type: 'text', languages: ['en'] }],
            expectedOutputs: [{ type: 'text', languages: ['en'] }]
        };
    }

    async initializeAI() {
        try {
            // Check if LanguageModel is available
            if (typeof LanguageModel === 'undefined') {
                this.updateAPIStatus('unavailable', 'AI not available in this browser');
                return;
            }

            // CRITICAL: Use the same options for availability() and create()
            const modelOptions = this.getLanguageModelOptions();
            
            // Check availability with the same options we'll use for create()
            const availability = await LanguageModel.availability(modelOptions);
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
                this.updateModelDownloadUI('downloading', 'AI model needs to be downloaded<br><br>Click the "Ask" button to start downloading. This is a one-time setup that may take 5-10 minutes depending on your internet connection.');
                // Don't create session here - wait for user gesture
                return;
            } else if (availability === 'available') {
                // Model is already available, safe to create session
                try {
                    // Use the same options as availability() check
                    this.aiSession = await LanguageModel.create(modelOptions);
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

    clearDownloadTimeout() {
        if (this.downloadTimeout) {
            clearTimeout(this.downloadTimeout);
            this.downloadTimeout = null;
        }
        if (this.stallCheckTimeout) {
            clearTimeout(this.stallCheckTimeout);
            this.stallCheckTimeout = null;
        }
    }

    cleanupFailedDownload() {
        this.clearDownloadTimeout();
        // Clear session reference if download failed
        if (!this.aiAvailable && this.aiSession) {
            this.aiSession = null;
        }
        this.downloadMonitor = null;
    }

    getErrorMessage(error) {
        const errorMsg = error?.message || String(error || 'Unknown error');
        const lowerMsg = errorMsg.toLowerCase();
        
        // Provide specific guidance based on error type
        if (lowerMsg.includes('network') || lowerMsg.includes('fetch') || lowerMsg.includes('connection')) {
            return 'Network error: Check your internet connection and try again.';
        } else if (lowerMsg.includes('disk') || lowerMsg.includes('space') || lowerMsg.includes('storage')) {
            return 'Insufficient disk space: Free up storage space and try again.';
        } else if (lowerMsg.includes('permission') || lowerMsg.includes('denied')) {
            return 'Permission denied: Check Chrome settings and ensure AI features are enabled.';
        } else if (lowerMsg.includes('timeout') || lowerMsg.includes('timed out')) {
            return 'Download timeout: The download took too long. Please check your connection and try again.';
        } else if (lowerMsg.includes('user gesture') || lowerMsg.includes('activation')) {
            return 'User gesture required: Please click the Ask button again to start the download.';
        } else {
            return `Download failed: ${errorMsg}. Please try again.`;
        }
    }

    async startModelDownload() {
        // CRITICAL: Start the download IMMEDIATELY to preserve user gesture
        // Do all async storage operations AFTER initiating LanguageModel.create()
        
        // Increment retry count synchronously (before any async ops)
        const currentAttempt = this.downloadRetryCount + 1;

        this.downloadRetryCount = currentAttempt;
        
        // Save retry count asynchronously AFTER starting download (deferred)
        setTimeout(() => {
            chrome.storage.local.set({ 'lg:lastDownloadRetry': Date.now() }).catch(e => {
                console.warn('[LegalGuard] Could not save retry time:', e);
            });
        }, 0);

        // Check retry limit synchronously first (quick check)
        if (currentAttempt > this.maxDownloadRetries) {
            console.warn(`[LegalGuard] Retry count ${currentAttempt} exceeds max ${this.maxDownloadRetries}, but starting download anyway to preserve user gesture`);
        }
        
        const retryText = currentAttempt > 1 ? ` (Attempt ${currentAttempt}/${this.maxDownloadRetries})` : '';
        this.updateAPIStatus('downloading', `Downloading AI model...${retryText}`);
        this.updateModelDownloadUI('downloading', `Downloading Chrome AI model (first-time setup)...${retryText}<br>Please wait a few minutes. This may take 5-10 minutes depending on your connection.`, 0);
        
        // Set overall timeout for the download (15 minutes)
        // This will be cleared when download completes or fails
        this.downloadTimeout = setTimeout(() => {
            console.warn('[LegalGuard] Download timeout after 15 minutes');
            this.cleanupFailedDownload();
            this.handleDownloadError(new Error('Download timeout: The download took too long. Please check your connection and try again.'));
        }, 15 * 60 * 1000); // 15 minutes
        
        let lastProgressTime = Date.now();
        let modelNewlyDownloaded = false;
        let downloadStarted = false;
        let monitorAttached = false;

        try {
            // CRITICAL: Use the same options for create() as we use for availability()
            const modelOptions = this.getLanguageModelOptions();
            
            const self = this;
            let downloadPromiseResolve = null;
            let downloadPromiseReject = null;
            const downloadPromise = new Promise((resolve, reject) => {
                downloadPromiseResolve = resolve;
                downloadPromiseReject = reject;
            });
            
            // Set a timeout to detect if download doesn't start within 10 seconds
            const downloadStartTimeout = setTimeout(() => {
                if (!downloadStarted && !monitorAttached) {
                    console.warn('[LegalGuard] Download did not start within 10 seconds - may have lost user gesture');
                    // Don't fail immediately - give it more time, but log the issue
                }
            }, 10000); // 10 seconds
            
            console.log('[LegalGuard] Attempting to create LanguageModel session (preserving user gesture)...');
            this.aiSession = await LanguageModel.create({
                ...modelOptions,
                monitor(m) {
                    monitorAttached = true;
                    clearTimeout(downloadStartTimeout);
                    self.downloadMonitor = m;
                    downloadStarted = true;
                    console.log('[LegalGuard] Download monitor attached - download has started');
                    
                    // Track progress (download is active)
                    m.addEventListener('downloadprogress', (e) => {
                        lastProgressTime = Date.now();
                        
                        // Clear existing stall check timeout
                        if (self.stallCheckTimeout) {
                            clearTimeout(self.stallCheckTimeout);
                            self.stallCheckTimeout = null;
                        }
                        
                        const ratio = typeof e.loaded === 'number' ? e.loaded : null;
                        const percent = ratio !== null ? Math.round(ratio * 100) : null;
                        console.log(`[LegalGuard] Downloaded ${percent ?? '?'}%`);
                        
                        // Update status with progress
                        const statusElement = document.getElementById('apiStatus');
                        if (statusElement) {
                            statusElement.textContent = percent !== null
                                ? `Downloading AI model... ${percent}%${retryText}`
                                : `Downloading AI model...${retryText}`;
                        }
                        
                        // Update UI with progress bar
                        if (ratio !== null) {
                            // Show progress bar with specific progress
                            self.updateModelDownloadUI(
                                'downloading', 
                                `Downloading Chrome AI model (first-time setup)...${retryText}`,
                                ratio
                            );
                            modelNewlyDownloaded = true;
                            
                            // When download reaches 100%, show indeterminate state for extraction/loading
                            if (ratio === 1) {
                                self.updateModelDownloadUI('preparing', 'Download complete. Preparing model...');
                            }
                        } else {
                            // No progress info available, show generic message
                            self.updateModelDownloadUI('downloading', `Downloading Chrome AI model (first-time setup)...${retryText}<br>Please wait a few minutes.`);
                        }
                        
                        // Set up stall detection - if no progress for 2 minutes, consider it stalled
                        self.stallCheckTimeout = setTimeout(() => {
                            const timeSinceLastProgress = Date.now() - lastProgressTime;
                            if (timeSinceLastProgress >= 2 * 60 * 1000) {
                                console.warn('[LegalGuard] No download progress for 2 minutes - download may be stalled');
                                self.cleanupFailedDownload();
                                const error = new Error('Download stalled: No progress detected. Please check your connection and try again.');
                                if (downloadPromiseReject) {
                                    downloadPromiseReject(error);
                                } else {
                                    self.handleDownloadError(error);
                                }
                            }
                        }, 2 * 60 * 1000); // Check after 2 minutes of no progress
                    });
                    
                    m.addEventListener('downloadcompleted', () => {
                        self.clearDownloadTimeout();
                        self.downloadRetryCount = 0; // Reset on success
                        chrome.storage.local.remove(['lg:lastDownloadRetry']);
                        
                        // Show indeterminate progress state (model is being extracted and loaded)
                        if (modelNewlyDownloaded) {
                            self.updateModelDownloadUI('preparing', 'Download complete. Preparing model...');
                        } else {
                            self.updateModelDownloadUI('preparing', 'Almost there... getting LegalGuard ready.');
                        }
                        console.log('[LegalGuard] Download completed successfully');
                        
                        // Mark as available after a brief delay to ensure everything is ready
                        setTimeout(() => {
                            self.aiAvailable = true;
                            self.updateAPIStatus('available', 'AI ready! Ask any legal question.');
                            self.updateModelDownloadUI('ready');
                            if (downloadPromiseResolve) {
                                downloadPromiseResolve(true);
                            }
                        }, 500);
                    });
                    
                    m.addEventListener('downloadfailed', (event) => {
                        self.clearDownloadTimeout();
                        const error = event?.error || new Error('Download failed');
                        console.error('[LegalGuard] Download failed:', error);
                        
                        if (downloadPromiseReject) {
                            downloadPromiseReject(error);
                        } else {
                            self.handleDownloadError(error);
                        }
                    });
                },
            });
            
            // Clear the start timeout if monitor was attached
            if (monitorAttached) {
                clearTimeout(downloadStartTimeout);
            }
            
            // If session was created successfully, wait for download to complete
            // But if the model was already available, we can proceed immediately
            if (this.aiSession) {
                // Check if download is needed or if it's already available
                // CRITICAL: Use the same options as create()
                const modelOptions = this.getLanguageModelOptions();
                
                // Wait a moment for the monitor to attach if download is needed
                await new Promise(resolve => setTimeout(resolve, 100));
                
                const checkAvailability = await LanguageModel.availability(modelOptions);
                console.log('[LegalGuard] Model availability after create:', checkAvailability, 'Monitor attached:', monitorAttached);
                
                if (checkAvailability === 'available') {
                    // Model is already available, no download needed
                    clearTimeout(downloadStartTimeout);
                    this.aiAvailable = true;
                    this.downloadRetryCount = 0;
                    chrome.storage.local.remove(['lg:lastDownloadRetry']);
                    this.updateAPIStatus('available', 'AI ready! Ask any legal question.');
                    this.updateModelDownloadUI('ready');
                    return true;
                } else if (!monitorAttached && (checkAvailability === 'downloadable' || checkAvailability === 'downloading')) {
                    // Model needs download but monitor wasn't attached - this might indicate user gesture was lost
                    console.warn('[LegalGuard] Model needs download but monitor was not attached - user gesture may have been lost');
                    // Still wait for download, but log the issue
                }
                
                // Wait for download to complete (with timeout)
                try {
                    await Promise.race([
                        downloadPromise,
                        new Promise((_, reject) => 
                            setTimeout(() => reject(new Error('Download timeout')), 15 * 60 * 1000)
                        )
                    ]);
                    return true;
                } catch (error) {
                    return this.handleDownloadError(error);
                }
            } else {
                throw new Error('Failed to create AI session');
            }
        } catch (error) {
            console.error('[LegalGuard] Could not create AI session:', error);
            this.clearDownloadTimeout();
            
            // Check if error is related to user gesture
            const errorMsg = error?.message || String(error);
            if (errorMsg.includes('user gesture') || errorMsg.includes('activation') || errorMsg.includes('gesture')) {
                console.error('[LegalGuard] User gesture may have been lost - user needs to click again');
                return this.handleDownloadError(new Error('User gesture required: Please click the Ask button again to start the download. Make sure to click immediately when prompted.'));
            }
            
            return this.handleDownloadError(error);
        }
    }

    handleDownloadError(error) {
        const errorMsg = this.getErrorMessage(error);
        console.error('[LegalGuard] Download error:', errorMsg, error);
        
        this.cleanupFailedDownload();
        
        // Check if error is specifically about user gesture
        const isUserGestureError = errorMsg.toLowerCase().includes('user gesture') || 
                                   errorMsg.toLowerCase().includes('activation') ||
                                   error?.message?.toLowerCase().includes('user gesture') ||
                                   error?.message?.toLowerCase().includes('activation');
        
        // If we have retries left, show retry message
        if (this.downloadRetryCount < this.maxDownloadRetries) {
            if (isUserGestureError) {
                this.updateAPIStatus('unavailable', 'User gesture required - please click "Ask" again');
                this.updateModelDownloadUI('hidden', `The download requires a user gesture to start.<br><br><strong>What to do:</strong><br>1. Click the "Ask" button again immediately<br>2. Make sure you click as soon as you see the prompt<br>3. Keep this window open during the download<br>4. Don't navigate away while downloading<br><br><strong>Note:</strong> Chrome requires a direct user action to download AI models. Please click "Ask" again to start the download.`);
            } else {
                this.updateAPIStatus('unavailable', `${errorMsg} (Retrying automatically...)`);
                this.updateModelDownloadUI('hidden', `${errorMsg}<br><br><strong>What you can do:</strong><br>• Ensure you have a stable internet connection<br>• Free up at least 500MB of disk space<br>• The download will retry automatically when you click "Ask" again<br>• Keep this window open during the download<br>• Make sure Chrome AI features are enabled in settings`);
            }
        } else {
            if (isUserGestureError) {
                this.updateAPIStatus('unavailable', 'User gesture required - please click "Ask" again');
                this.updateModelDownloadUI('hidden', `The download requires a user gesture to start.<br><br><strong>Troubleshooting steps:</strong><br>1. Click the "Ask" button again immediately when prompted<br>2. Make sure you click as soon as you see the download prompt<br>3. Check Chrome settings → Privacy and security → AI features are enabled<br>4. Ensure you have at least 500MB free disk space<br>5. Check your internet connection is stable<br>6. Try refreshing this page and clicking "Ask" again<br>7. If the issue persists, restart Chrome<br><br><strong>Important:</strong> Chrome requires a direct user action (click) to download AI models. Please click "Ask" again to start the download.`);
            } else {
                this.updateAPIStatus('unavailable', errorMsg);
                this.updateModelDownloadUI('hidden', `${errorMsg}<br><br><strong>Troubleshooting steps:</strong><br>1. Check your internet connection is stable<br>2. Ensure you have at least 500MB free disk space<br>3. Check Chrome settings → Privacy and security → AI features are enabled<br>4. Try refreshing this page and clicking "Ask" again<br>5. If the issue persists, restart Chrome<br><br><strong>Note:</strong> Model downloads can take 5-10 minutes. Please keep this window open during the download.`);
            }
        }
        
        this.setPromptInputEnabled(true);
        return false;
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
            // CRITICAL: Use the same options for availability() and create()
            const modelOptions = this.getLanguageModelOptions();
            
            // CRITICAL: Check availability quickly, but if it's downloadable/downloading,
            // start the download IMMEDIATELY to preserve user gesture
            // Don't wait for the full availability check if we know we need to download
            let availability = this.aiAvailabilityState;
            
            // Only do async availability check if we don't already know the state
            // or if we suspect it might have changed
            if (!availability || availability === 'available') {
                try {
                    // Use Promise.race to avoid waiting too long for availability check
                    availability = await Promise.race([
                        LanguageModel.availability(modelOptions),
                        new Promise((resolve) => setTimeout(() => resolve(null), 1000)) // 1 second timeout
                    ]);
                    
                    // If availability check timed out, assume downloadable to preserve gesture
                    if (availability === null) {
                        console.warn('[LegalGuard] Availability check timed out - assuming downloadable to preserve user gesture');
                        availability = 'downloadable';
                    }
                } catch (error) {
                    console.warn('[LegalGuard] Availability check failed:', error);
                    // If availability check fails, try to create anyway to preserve gesture
                    availability = 'downloadable';
                }
            }
            
            this.aiAvailabilityState = availability;

            if (availability === 'unavailable') {
                this.updateAPIStatus('unavailable', 'AI not available on this device');
                this.updateModelDownloadUI('hidden');
                return false;
            }

            // CRITICAL: If model needs download, start IMMEDIATELY to preserve user gesture
            // Don't do any other async operations before this
            if (availability === 'downloadable' || availability === 'downloading') {
                console.log('[LegalGuard] Model needs download - starting immediately to preserve user gesture');
                return await this.startModelDownload();
            } else if (availability === 'available') {
                try {
                    // Reset retry count since model is available
                    this.downloadRetryCount = 0;
                    chrome.storage.local.remove(['lg:lastDownloadRetry']);
                    
                    // Use the same options as availability() check
                    this.aiSession = await LanguageModel.create(modelOptions);
                    this.aiAvailable = true;
                    this.updateAPIStatus('available', 'AI ready! Ask any legal question.');
                    this.updateModelDownloadUI('ready');
                    return true;
                } catch (error) {
                    console.error('[LegalGuard] Could not create AI session:', error);
                    const errorMsg = this.getErrorMessage(error);
                    
                    // If error suggests download is needed, try starting download
                    if (errorMsg.includes('download') || errorMsg.includes('gesture')) {
                        console.log('[LegalGuard] Error suggests download needed - attempting download');
                        return await this.startModelDownload();
                    }
                    
                    this.updateAPIStatus('unavailable', errorMsg);
                    this.updateModelDownloadUI('hidden', `Failed to initialize AI: ${errorMsg}`);
                    this.setPromptInputEnabled(true);
                    return false;
                }
            }

            return false;
        } catch (error) {
            console.error('[LegalGuard] Failed to ensure AI session:', error);
            const errorMsg = this.getErrorMessage(error);
            
            // If error suggests we need a download, try that
            if (errorMsg.includes('download') || errorMsg.includes('gesture')) {
                console.log('[LegalGuard] Error suggests download needed - attempting download');
                return await this.startModelDownload();
            }
            
            this.updateAPIStatus('unavailable', `AI initialization failed: ${errorMsg}`);
            this.updateModelDownloadUI('hidden', `AI initialization failed: ${errorMsg}`);
            this.cleanupFailedDownload();
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
        
        const languageName = targetLanguage === 'en' ? 'English' : 
                            targetLanguage === 'es' ? 'Spanish' : 
                            targetLanguage === 'fr' ? 'French' : 
                            targetLanguage === 'de' ? 'German' : 
                            targetLanguage === 'it' ? 'Italian' : 
                            targetLanguage === 'pt' ? 'Portuguese' : 
                            targetLanguage === 'zh' ? 'Chinese' : 
                            targetLanguage === 'ja' ? 'Japanese' : 'English';

        let systemPrompt = `You are LegalGuard, an AI assistant that explains, summarizes, and locates Terms of Service (TOS), Privacy Policies, and AI Policies on any website.

Your job is to:

1. Answer the user's question directly with concrete, specific examples.

2. Give practical implications with real-world scenarios.

3. Give actionable safety guidance with specific steps users can take.

4. Reference the relevant sections of the TOS/Policy if available.

5. Provide concrete examples of how data might be shared, used, or stored based on common industry practices.

6. When discussing data security, give specific, actionable steps (e.g., "Enable 2FA", "Use a password manager", "Review app permissions monthly").

=====================================================

OUTPUT FORMAT RULES — MUST FOLLOW

=====================================================

🟣 1. Layout must be **tight and compact**:
- Do NOT insert extra blank lines.
- Keep **only one** blank line between sections.
- Bullet lists should have **no extra spacing** between items.
- Avoid long paragraphs; keep lines short.

🟣 2. Section rules - CRITICAL: Determine question type FIRST:

**YES/NO questions** (use "Short answer:"):
- Questions that can be answered with Yes/No/It depends
- Examples: "Will my data be used for AI?", "Can I resell this?", "Do I keep ownership?", "Is this allowed?"
- Format:
  **Short answer:** Yes / No / It depends (1 short sentence only)
  **What this means for you**
  **How to reduce risk**
  **Relevant TOS sections**

**EXPLANATORY questions** (use "Direct answer:" - NO "Short answer"):
- Questions asking for explanation, meaning, location, or how something works
- Examples: "Explain this clause", "What does this mean?", "Where is the AI policy?", "How does this work?", "What is [term]?"
- Format:
  **Direct answer:** <1–2 sentences with concrete examples>
  **Details** (include specific examples of how data is shared, stored, or used)
  **What this means for you** (with real-world scenarios)
  **How to reduce risk** (specific, actionable steps like "Enable 2FA", "Use a password manager", "Review privacy settings monthly")
  **Relevant TOS sections**

**IMPORTANT**: If the question starts with "explain", "what", "how", "where", "why", or asks for meaning/definition, it is NOT a Yes/No question. Do NOT use "Short answer: Yes/No". Use "Direct answer:" instead.

🟣 3. If AI policy is not found:
- Say clearly: "The provided text does not include an AI policy."
- Then provide:
  **Estimated summary (not from the website):** <3–5 compact bullet points>
- Mark clearly this is an estimate, not the website's text.

🟣 4. Tone and clarity:
- Simple English.
- Very practical with concrete examples.
- No legal jargon.
- No long text blocks.
- Always include specific examples: "For example, your meeting transcripts might be shared with third-party analytics services" or "Your data could be used to train AI models that power features like auto-summarization."
- When discussing security, give specific steps: "Enable two-factor authentication", "Use a unique password", "Review connected apps monthly", etc.

🟣 5. Never hallucinate actual policy text.
- Only quote what is provided.
- Industry-practice guesses must be labeled: "Estimated summary (not from the website)."

=====================================================

CRITICAL REQUIREMENTS:
- Return MARKDOWN ONLY. No HTML tags. No <div>, <p>, <span>, <br>, etc.
- Write in ${languageName}
- Follow these format rules strictly.
- **CRITICAL**: Questions starting with "explain", "what", "how", "where", "why" or asking for meaning/definition are EXPLANATORY questions. Use "Direct answer:" NOT "Short answer: Yes/No".
- **ALWAYS provide concrete examples**: Instead of "data may be shared", say "your meeting transcripts, email content, or usage patterns may be shared with third-party analytics services, advertising partners, or AI training providers."
- **ALWAYS give specific, actionable steps**: Instead of "improve security", say "Enable two-factor authentication, use a password manager with unique passwords, review connected apps monthly, and check privacy settings quarterly."
- When discussing data sharing, provide specific examples of what data types (transcripts, emails, usage data, metadata) and who might receive it (analytics services, advertisers, AI providers, partners).
- Your priority is: **Be correct → Be clear → Be practical with examples → Be helpful with actionable steps.**`;

        if (tone === 'eli3') {
            systemPrompt += `

ELI3 MODE REQUIREMENTS:
- Use simple, kid-friendly language
- Add exactly ONE emoji to each bullet point
- Use words a 3-year-old would understand
- Keep sentences short and clear
- Use fun analogies when possible
- Examples: "🎯 This means..." "💡 Remember..." "⚠️ Watch out for..."
- Still follow the intelligent answer structure (Short answer for Yes/No questions, Direct answer for others)`;
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

        // CRITICAL: Ensure AI session is created IMMEDIATELY after button click
        // This preserves the user gesture for model download
        // Don't do any async operations before this call
        try {
            const aiReady = await this.ensureAISession();
            if (!aiReady || !this.aiAvailable) {
                console.warn('[LegalGuard] AI session not ready, cannot send message');
                return;
            }
        } catch (error) {
            console.error('[LegalGuard] Failed to ensure AI session:', error);
            this.updateAPIStatus('unavailable', `Failed to initialize AI: ${error.message}`);
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

        // CRITICAL: Ensure AI session is created IMMEDIATELY after button click
        // This preserves the user gesture for model download
        try {
            const aiReady = await this.ensureAISession();
            if (!aiReady || !this.aiAvailable) {
                console.warn('[LegalGuard] AI session not ready, cannot send quick action');
                return;
            }
        } catch (error) {
            console.error('[LegalGuard] Failed to ensure AI session:', error);
            this.updateAPIStatus('unavailable', `Failed to initialize AI: ${error.message}`);
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

        // Safety check before appending
        if (messagesContainer && typeof messagesContainer.appendChild === 'function') {
            messagesContainer.appendChild(messageElement);
            this.scrollToBottom();
        } else {
            console.warn('[LegalGuard] Cannot append message: messagesContainer.appendChild not available');
            return null;
        }
        
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
        
        // Safety checks before appending
        if (controlsDiv && typeof controlsDiv.appendChild === 'function') {
            controlsDiv.appendChild(originalBtn);
            controlsDiv.appendChild(translatedBtn);
        } else {
            console.warn('[LegalGuard] Cannot append translation controls: appendChild not available');
            return;
        }
        
        // Set initial content to translated version (since Translated button is active by default)
        messageElement.innerHTML = translatedText;
        
        // Insert controls after the message (with safety check)
        if (messageElement.parentNode && typeof messageElement.parentNode.insertBefore === 'function') {
            messageElement.parentNode.insertBefore(controlsDiv, messageElement.nextSibling);
        } else {
            console.warn('[LegalGuard] Cannot insert translation controls: parentNode.insertBefore not available');
        }
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

    async checkForSelectedText() {
        try {
            if (!this.currentTabId) return;
            
            // Check for stored selected text from context menu
            const result = await chrome.storage.local.get([`lg:selectedText:${this.currentTabId}`]);
            const selectedTextData = result[`lg:selectedText:${this.currentTabId}`];
            
            if (selectedTextData && selectedTextData.text) {
                const selectedText = selectedTextData.text;
                const timestamp = selectedTextData.timestamp || 0;
                const age = Date.now() - timestamp;
                
                // Only use if it's recent (within last 30 seconds)
                if (age < 30000 && selectedText.trim()) {
                    console.log('[LegalGuard] Found selected text from context menu:', selectedText.substring(0, 50));
                    
                    // Auto-fill the chat input with explanation prompt
                    const chatInput = this.elements?.chatInput || document.getElementById('chat-input');
                    if (chatInput) {
                        // Create an explanation prompt
                        const explanationPrompt = `Explain this clause: "${selectedText.trim()}"`;
                        chatInput.value = explanationPrompt;
                        this.hasInputText = true;
                        this.syncPromptControls();
                        
                        // Optionally auto-send (or just fill and let user click)
                        // For now, just fill it - user can click send
                        console.log('[LegalGuard] Auto-filled chat input with selected text');
                    }
                    
                    // Clear the stored text so it doesn't trigger again
                    await chrome.storage.local.remove([`lg:selectedText:${this.currentTabId}`]);
                }
            }
        } catch (error) {
            console.warn('[LegalGuard] Error checking for selected text:', error);
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
                    // Connection errors are expected if content script isn't loaded yet or page doesn't support it
                    // This is not a critical error, so we'll handle it gracefully
                    if (error?.message?.includes('Receiving end does not exist') || 
                        error?.message?.includes('Could not establish connection')) {
                        console.log('[LegalGuard] Content script not available for highlighted terms (this is normal for some pages)');
                        this.showEmptyState('Content script not loaded - try refreshing the page');
                    } else {
                        console.warn('[LegalGuard] Could not get highlighted terms:', error);
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
        
		summaryElement.innerHTML = `
			<div class="page-analysis-container">
				<!-- Section 1: Page Summary -->
				<div class="analysis-section">
					<div class="analysis-section-title">
						<span class="section-icon">🔍</span>
						<span>Page Summary</span>
					</div>
					<div id="summary-section" class="summary-text">
						<em style="color: #64748b;">Generating page summary…</em>
					</div>
				</div>

				<!-- Section 2: Key Risks & Data Use -->
				<div class="analysis-section">
					<div class="analysis-section-title">
						<span>Key Risks & Data Use</span>
					</div>
					<div id="legal-signals-grid" class="legal-signals-grid">
						<div class="signal-card">
							<div class="signal-label-line">
								<span class="signal-icon">👤</span>
								<span class="signal-label-bold">Ownership – What you keep</span>
							</div>
							<div class="signal-description" id="signal-ownership">Analyzing…</div>
						</div>
						<div class="signal-card">
							<div class="signal-label-line">
								<span class="signal-icon">📄</span>
								<span class="signal-label-bold">License – How your content can be used</span>
							</div>
							<div class="signal-description" id="signal-license">Analyzing…</div>
						</div>
						<div class="signal-card">
							<div class="signal-label-line">
								<span class="signal-icon">🔒</span>
								<span class="signal-label-bold">Restrictions – What you could lose</span>
							</div>
							<div class="signal-description" id="signal-restrictions">Analyzing…</div>
						</div>
						<div class="signal-card">
							<div class="signal-label-line">
								<span class="signal-icon">⚠️</span>
								<span class="signal-label-bold">Age – Who is responsible</span>
							</div>
							<div class="signal-description" id="signal-age">Analyzing…</div>
						</div>
						<div class="signal-card">
							<div class="signal-label-line">
								<span class="signal-icon">🔧</span>
								<span class="signal-label-bold">Changes – Moving target</span>
							</div>
							<div class="signal-description" id="signal-changes">Analyzing…</div>
						</div>
						<div class="signal-card">
							<div class="signal-label-line">
								<span class="signal-icon">🤖</span>
								<span class="signal-label-bold">AI Policy – How AI may use your data</span>
							</div>
							<div class="signal-description" id="signal-ai">Analyzing…</div>
						</div>
					</div>
				</div>

				<!-- Section 3: Extracted Clause -->
				<div class="analysis-section" id="extracted-clause-section" style="display: none;">
					<div class="analysis-section-title">
						<span>Extracted Clause</span>
					</div>
					<div id="extracted-clause" class="extracted-clause-box">
						<!-- Clause content will be inserted here -->
					</div>
				</div>
			</div>
		`;

		// Kick off AI summarization (non-blocking)
		this.generatePageSummaryWithAI().catch(() => {
			const container = document.getElementById('summary-section');
			if (container) {
				container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
			}
		});
	}

	/**
	 * Recursive Character Text Splitter
	 * Splits text into chunks while avoiding splitting in the middle of words or sentences
	 * Based on LangChain.js RecursiveCharacterTextSplitter approach
	 */
	recursiveTextSplitter(text, chunkSize = 3000, chunkOverlap = 200) {
		if (!text || text.length <= chunkSize) {
			return [text];
		}

		const chunks = [];
		let start = 0;

		while (start < text.length) {
			let end = Math.min(start + chunkSize, text.length);
			
			// If not at the end, try to find a good split point
			if (end < text.length) {
				// Try to split at paragraph break first
				const paragraphBreak = text.lastIndexOf('\n\n', end);
				if (paragraphBreak > start) {
					end = paragraphBreak + 2;
				} else {
					// Try to split at sentence end
					const sentenceEnd = Math.max(
						text.lastIndexOf('. ', end),
						text.lastIndexOf('.\n', end),
						text.lastIndexOf('! ', end),
						text.lastIndexOf('? ', end)
					);
					if (sentenceEnd > start) {
						end = sentenceEnd + 2;
					} else {
						// Try to split at word boundary
						const wordBreak = text.lastIndexOf(' ', end);
						if (wordBreak > start) {
							end = wordBreak + 1;
						}
					}
				}
			}

			const chunk = text.slice(start, end).trim();
			if (chunk) {
				chunks.push(chunk);
			}

			// Move start position with overlap
			start = Math.max(start + 1, end - chunkOverlap);
		}

		return chunks;
	}

	/**
	 * Determine available token capacity for summarization
	 * Uses measureInputUsage() and inputQuota to check token availability
	 * Reference: https://developer.chrome.com/docs/ai/scale-summarization
	 */
	async getAvailableTokenCapacity(summarizer) {
		try {
			if (summarizer && typeof summarizer.measureInputUsage === 'function') {
				// Measure an empty string to get baseline token usage
				const measurement = await summarizer.measureInputUsage('');
				const quota = summarizer.inputQuota;
				if (quota !== undefined && measurement && measurement.inputTokens !== undefined) {
					// Available tokens = total quota - baseline usage
					const available = quota - measurement.inputTokens;
					console.log(`[LegalGuard] Token capacity: ${available} available out of ${quota} total`);
					return available;
				}
			}
		} catch (e) {
			console.warn('[LegalGuard] Could not measure token capacity:', e);
		}
		// Fallback: assume ~750 tokens per 3000 characters (4 chars per token average)
		// This is a conservative estimate for client-side models
		return null;
	}

	/**
	 * Filter out boilerplate and navigation text
	 * Removes common non-content elements to reduce text size
	 */
	filterBoilerplate(text) {
		if (!text) return '';
		
		// Remove excessive whitespace
		let cleaned = text.replace(/\s+/g, ' ').trim();
		
		// Remove common boilerplate patterns
		const boilerplatePatterns = [
			/cookie\s+policy/gi,
			/privacy\s+policy/gi,
			/terms\s+of\s+service/gi,
			/click\s+here/gi,
			/read\s+more/gi,
			/continue\s+reading/gi,
			/subscribe\s+to\s+our\s+newsletter/gi,
			/follow\s+us\s+on/gi,
			/share\s+this/gi,
			/\b(copyright|©|®|™)\s+\d{4}/gi,
			/all\s+rights\s+reserved/gi
		];
		
		// Remove lines that are mostly boilerplate
		const lines = cleaned.split(/[.!?]\s+/);
		const filteredLines = lines.filter(line => {
			const trimmed = line.trim();
			if (trimmed.length < 20) return false; // Too short
			if (boilerplatePatterns.some(pattern => pattern.test(trimmed))) return false;
			return true;
		});
		
		return filteredLines.join('. ').substring(0, 50000); // Limit to reasonable size
	}

	/**
	 * Intelligently truncate text to extract most important parts
	 * Takes intro, middle key paragraphs, and conclusion
	 */
	intelligentlyTruncate(text, maxChars = 8000) {
		if (!text || text.length <= maxChars) {
			return text;
		}

		// Clean and normalize
		const cleaned = text.replace(/\s+/g, ' ').trim();
		
		// Split into paragraphs
		const paragraphs = cleaned.split(/\n\s*\n|\.\s+(?=[A-Z])/).filter(p => p.trim().length > 50);
		
		if (paragraphs.length === 0) {
			// Fallback: just take first part
			return cleaned.substring(0, maxChars);
		}

		// Strategy: Take first 30%, middle 40%, last 30% of paragraphs
		const introCount = Math.max(1, Math.floor(paragraphs.length * 0.3));
		const middleCount = Math.max(1, Math.floor(paragraphs.length * 0.4));
		const outroCount = Math.max(1, Math.floor(paragraphs.length * 0.3));

		const selected = [
			...paragraphs.slice(0, introCount), // Introduction
			...paragraphs.slice(Math.floor(paragraphs.length / 2) - Math.floor(middleCount / 2), 
			                    Math.floor(paragraphs.length / 2) + Math.ceil(middleCount / 2)), // Middle
			...paragraphs.slice(-outroCount) // Conclusion
		];

		// Remove duplicates and join
		const unique = [...new Set(selected)];
		let result = unique.join('. ');

		// If still too long, trim to fit
		if (result.length > maxChars) {
			result = result.substring(0, maxChars);
			// Try to end at a sentence boundary
			const lastPeriod = result.lastIndexOf('.');
			if (lastPeriod > maxChars * 0.9) {
				result = result.substring(0, lastPeriod + 1);
			}
		}

		return result + (cleaned.length > result.length ? '...' : '');
	}

	/**
	 * Generate a simple text-based summary fallback
	 * Extracts key sentences and creates a basic summary when API is unavailable
	 */
	generateFallbackSummary(text, maxLength = 500) {
		if (!text || text.length < 100) {
			return 'Summary not available - content too short.';
		}

		// Remove excessive whitespace
		const cleaned = text.replace(/\s+/g, ' ').trim();
		
		// Try to extract first few sentences
		const sentences = cleaned.match(/[^.!?]+[.!?]+/g) || [];
		
		if (sentences.length === 0) {
			// Fallback to first N characters
			return cleaned.substring(0, maxLength) + (cleaned.length > maxLength ? '...' : '');
		}

		// Take first 3-5 sentences that fit within maxLength
		let summary = '';
		for (let i = 0; i < Math.min(sentences.length, 5); i++) {
			const candidate = summary + (summary ? ' ' : '') + sentences[i].trim();
			if (candidate.length <= maxLength) {
				summary = candidate;
			} else {
				break;
			}
		}

		if (!summary) {
			// If no sentences fit, just take first part
			summary = cleaned.substring(0, maxLength);
		}

		return summary.trim() + (cleaned.length > summary.length ? '...' : '');
	}

	/**
	 * Summary of Summaries technique with timeout and progress tracking
	 * Splits large text into chunks, summarizes each, then summarizes the concatenated summaries
	 * Supports recursive summarization for very long content
	 */
	async summarizeWithChunking(text, summarizer, options = {}) {
		const {
			chunkSize = 3000,
			chunkOverlap = 200,
			maxRecursionDepth = 3, // Reduced from 5 to 3 for faster processing
			recursionDepth = 0,
			onProgress = null // Callback for progress updates
		} = options;

		// Check if text fits in one go
		const estimatedTokens = Math.ceil(text.length / 4); // ~4 chars per token
		
		// Try to get actual token capacity
		let availableTokens = await this.getAvailableTokenCapacity(summarizer);
		if (availableTokens === null) {
			// Fallback: use estimated chunk size
			availableTokens = Math.floor(chunkSize / 4);
		}

		// If text is small enough, summarize directly
		if (estimatedTokens <= availableTokens * 0.8) { // Use 80% of capacity for safety
			try {
				const summary = await summarizer.summarize(text, {
					context: options.context || 'Remove boilerplate and navigation text. Focus on substantive content.'
				});
				return summary || '';
			} catch (e) {
				console.warn('[LegalGuard] Direct summarization failed, trying chunking:', e);
				// Fall if direct summarization fails, continue with chunking
			}
		}

		// Text is too long, split and summarize chunks
		if (recursionDepth >= maxRecursionDepth) {
			console.warn('[LegalGuard] Max recursion depth reached');
			throw new Error('Content too long to summarize');
		}

		const chunks = this.recursiveTextSplitter(text, chunkSize, chunkOverlap);
		console.log(`[LegalGuard] Split text into ${chunks.length} chunks for summarization`);

		// Limit chunks to prevent excessive processing time
		// Process max 10 chunks to stay within 2-minute limit
		const maxChunks = 10;
		const chunksToProcess = chunks.slice(0, maxChunks);
		if (chunks.length > maxChunks) {
			console.warn(`[LegalGuard] Limiting to first ${maxChunks} chunks out of ${chunks.length} to stay within time limit`);
		}

		// Summarize each chunk with progress tracking
		const chunkSummaries = [];
		for (let i = 0; i < chunksToProcess.length; i++) {
			if (onProgress) {
				onProgress(`Processing chunk ${i + 1}/${chunksToProcess.length}...`);
			}
			try {
				const chunkSummary = await summarizer.summarize(chunksToProcess[i], {
					context: options.context || 'Remove boilerplate and navigation text. Focus on substantive content.'
				});
				if (chunkSummary && chunkSummary.trim()) {
					chunkSummaries.push(chunkSummary.trim());
				}
			} catch (e) {
				console.warn(`[LegalGuard] Failed to summarize chunk ${i + 1}/${chunksToProcess.length}:`, e);
				// Continue with other chunks even if one fails
			}
		}

		if (chunkSummaries.length === 0) {
			throw new Error('Failed to generate any chunk summaries');
		}

		// Concatenate summaries with newlines
		const concatenatedSummaries = chunkSummaries.join('\n\n');

		// Check if concatenated summaries need recursive summarization
		const concatenatedTokens = Math.ceil(concatenatedSummaries.length / 4);
		if (concatenatedTokens > availableTokens * 0.8) {
			// Recursively summarize the summaries
			console.log(`[LegalGuard] Recursively summarizing ${chunkSummaries.length} summaries (depth ${recursionDepth + 1})`);
			return await this.summarizeWithChunking(
				concatenatedSummaries,
				summarizer,
				{
					...options,
					recursionDepth: recursionDepth + 1
				}
			);
		} else {
			// Summarize the concatenated summaries
			if (onProgress) {
				onProgress('Combining summaries...');
			}
			try {
				const finalSummary = await summarizer.summarize(concatenatedSummaries, {
					context: 'This is a collection of summaries. Create a cohesive, comprehensive summary that combines all the key points.'
				});
				return finalSummary || concatenatedSummaries;
			} catch (e) {
				console.warn('[LegalGuard] Failed to summarize concatenated summaries, returning as-is:', e);
				// Return concatenated summaries if final summarization fails
				return concatenatedSummaries;
			}
		}
	}

	/**
	 * Fast summarization strategy: Try direct first, then intelligent truncation
	 * Much faster and more reliable than chunking
	 */
	async summarizeFast(text, summarizer, options = {}) {
		const TIMEOUT_MS = 30 * 1000; // 30 seconds (much faster!)
		const container = options.container || null;
		const context = options.context || 'Remove boilerplate and navigation text. Focus on substantive content.';

		// Step 1: Filter boilerplate to reduce size
		let processedText = this.filterBoilerplate(text);
		
		// Step 2: Try direct summarization first (fastest)
		if (container) {
			container.innerHTML = '<em style="color: #64748b;">Generating summary...</em>';
		}

		try {
			const directPromise = summarizer.summarize(processedText, { context });
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS);
			});

			const summary = await Promise.race([directPromise, timeoutPromise]);
			if (summary && summary.trim()) {
				return summary.trim();
			}
		} catch (error) {
			// Direct summarization failed - likely content too long
			console.log('[LegalGuard] Direct summarization failed, trying intelligent truncation:', error.message);
		}

		// Step 3: If direct failed, use intelligent truncation (much faster than chunking)
		if (container) {
			container.innerHTML = '<em style="color: #64748b;">Processing large content...</em>';
		}

		try {
			// Intelligently extract key parts (intro, middle, conclusion)
			const truncated = this.intelligentlyTruncate(processedText, 8000); // ~2000 tokens
			
			const truncatePromise = summarizer.summarize(truncated, { context });
			const timeoutPromise = new Promise((_, reject) => {
				setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS);
			});

			const summary = await Promise.race([truncatePromise, timeoutPromise]);
			if (summary && summary.trim()) {
				return summary.trim();
			}
		} catch (error) {
			console.warn('[LegalGuard] Truncated summarization also failed:', error.message);
		}

		// Step 4: Last resort - return intelligent fallback
		if (container) {
			container.innerHTML = '<em style="color: #64748b;">Generating fallback summary...</em>';
		}

		return this.generateFallbackSummary(processedText, 500);
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

			// Ensure we have a current tab ID
			if (!this.currentTabId) {
				await this.getCurrentTab();
			}

			// Retrieve page text from the content script
			let pageText = '';
			let pageLang = undefined;
			if (this.currentTabId) {
				try {
					const response = await chrome.tabs.sendMessage(this.currentTabId, { type: 'GET_PAGE_TEXT' });
					if (response?.success && typeof response.text === 'string') {
						pageText = response.text;
						console.log('[LegalGuard] Retrieved page text, length:', pageText.length);
					} else {
						console.warn('[LegalGuard] Failed to get page text:', response);
					}
				} catch (e) {
					console.warn('[LegalGuard] Error getting page text:', e.message);
				}
			} else {
				console.warn('[LegalGuard] No current tab ID available');
			}

			// Fallback: Try to get text from currentData if page text retrieval failed
			if ((!pageText || pageText.trim().length < 50) && this.currentData) {
				if (this.currentData.foundTerms && this.currentData.foundTerms.length > 0) {
					// Extract text from found terms as fallback
					pageText = this.currentData.foundTerms.map(t => t.context || t.phrase || '').join(' ').slice(0, 5000);
					console.log('[LegalGuard] Using fallback text from detected terms, length:', pageText.length);
				}
			}

			// Try to get detected page language (for multilingual output)
			// Chrome Summarizer API supports: en, es, ja
			const supportedLanguages = ['en', 'es', 'ja'];
			try {
				const langRes = await chrome.tabs.sendMessage(this.currentTabId, { type: 'GET_PAGE_LANG' });
				if (langRes?.success && typeof langRes.lang === 'string') {
					const detectedLang = langRes.lang.toLowerCase().split('-')[0]; // Get base language code
					if (supportedLanguages.includes(detectedLang)) {
						pageLang = detectedLang;
					}
				}
			} catch (e) {
				// optional
			}

			// Always ensure a valid output language is specified (default to 'en')
			if (!pageLang || !supportedLanguages.includes(pageLang)) {
				pageLang = 'en';
			}

			if (!pageText || pageText.trim().length < 50) {
				const reason = !pageText ? 'No page content available' : `Page content too short (${pageText.trim().length} chars, need 50+)`;
				console.warn('[LegalGuard] Cannot generate summary:', reason);
				container.innerHTML = `<em style="color: #9ca3af;">Summary not available. ${reason}. Please ensure the page has loaded and contains legal text.</em>`;
				// Still try to extract signals from currentData if available
				if (this.currentData && this.currentData.categories) {
					this.extractLegalSignalsFromCategories();
				}
				return;
			}

			// Create summarizer with medium length for ~100–150 words
			let summarizer;
			try {
				summarizer = await Summarizer.create({
					type: 'tldr',
					format: 'plain-text',
					length: 'medium',
					outputLanguage: pageLang, // Always a valid language code: en, es, or ja
					sharedContext: 'Act as a legal expert. Create a compact Page Summary (100–150 words) highlighting ONLY: (1) User rights - ownership and licenses granted/retained, (2) Platform privileges - what the platform can do with user content/data, (3) AI-related clauses - clearly state yes/no/unclear if AI usage is mentioned, (4) Key restrictions - important limitations or prohibitions, (5) Age requirements - minimum age or age-related restrictions, (6) Risk-relevant notes - important warnings or liability limitations. Use clear, neutral tone. Do NOT include technical metadata like term counts or category counts.'
				});
			} catch (e) {
				// If user activation is required, show a button to retry
				if (String(e?.message || '').toLowerCase().includes('activation') || String(e).toLowerCase().includes('gesture')) {
					container.innerHTML = '<button id="lg-generate-summary" style="all: unset; cursor: pointer; color: #2563eb;">Click to generate summary</button>';
					document.getElementById('lg-generate-summary')?.addEventListener('click', async () => {
						container.innerHTML = '<em style="color: #64748b;">Generating page summary…</em>';
						try {
							// Ensure valid output language (default to 'en' if not set)
							const validLang = pageLang && supportedLanguages.includes(pageLang) ? pageLang : 'en';
							const s = await Summarizer.create({
								type: 'tldr',
								format: 'plain-text',
								length: 'medium',
								outputLanguage: validLang, // Always a valid language code: en, es, or ja
								sharedContext: 'Act as a legal expert. Create a compact Page Summary (100–150 words) highlighting ONLY: (1) User rights - ownership and licenses granted/retained, (2) Platform privileges - what the platform can do with user content/data, (3) AI-related clauses - clearly state yes/no/unclear if AI usage is mentioned, (4) Key restrictions - important limitations or prohibitions, (5) Age requirements - minimum age or age-related restrictions, (6) Risk-relevant notes - important warnings or liability limitations. Use clear, neutral tone. Do NOT include technical metadata like term counts or category counts.'
							});
							// Use fast summarization: direct first, then intelligent truncation
							const text = await this.summarizeFast(pageText, s, {
								context: 'Remove boilerplate and navigation text. Focus on substantive content. Create a compact Page Summary highlighting ONLY: (1) User rights - ownership and licenses, (2) Platform privileges - what platform can do with user content/data, (3) AI-related clauses - yes/no/unclear, (4) Key restrictions, (5) Age requirements, (6) Risk-relevant notes. Do NOT include technical metadata.',
								container: container
							});
							const summaryText = (text || '').trim() || 'Summary not available';
							container.textContent = summaryText;
							// Extract legal signals from summary
							if (summaryText && summaryText !== 'Summary not available') {
								this.extractLegalSignals(summaryText);
							}
						} catch (innerErr) {
							console.error('[LegalGuard] Summarization failed in retry:', innerErr);
							// Try fallback summary
							try {
								const fallbackText = this.generateFallbackSummary(pageText, 500);
								const fallbackSummary = fallbackText || 'Summary not available';
								container.textContent = fallbackSummary;
								// Extract legal signals from fallback summary
								if (fallbackSummary && fallbackSummary !== 'Summary not available') {
									this.extractLegalSignals(fallbackSummary);
								}
							} catch (fallbackErr) {
								container.innerHTML = '<em style="color: #9ca3af;">Summary not available. Content may be too long or complex.</em>';
							}
						}
					});
					return;
				}
				container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
				return;
			}

			let summaryText = '';
			try {
				// Use fast summarization: direct first, then intelligent truncation
				// Much faster and more reliable than chunking
				summaryText = await this.summarizeFast(pageText, summarizer, {
					context: 'Remove boilerplate and navigation text. Focus on substantive content. Create a compact Page Summary highlighting ONLY: (1) User rights - ownership and licenses, (2) Platform privileges - what platform can do with user content/data, (3) AI-related clauses - yes/no/unclear, (4) Key restrictions, (5) Age requirements, (6) Risk-relevant notes. Do NOT include technical metadata.',
					container: container
				});
			} catch (e) {
				console.error('[LegalGuard] Summarization failed:', e);
				// Try fallback summary
				try {
					summaryText = this.generateFallbackSummary(pageText, 500);
				} catch (fallbackError) {
					container.innerHTML = '<em style="color: #9ca3af;">Summary not available. Content may be too long or complex.</em>';
					return;
				}
			}

			if (!summaryText || !summaryText.trim()) {
				container.innerHTML = '<em style="color: #9ca3af;">Summary not available</em>';
				return;
			}

			// Insert the summary
			container.textContent = summaryText.trim();
			
			// Extract and display key legal signals from the summary
			this.extractLegalSignals(summaryText.trim());
		} catch (error) {
			console.error('[LegalGuard] Page summary generation error:', error);
			const container = document.getElementById('summary-section');
			if (container) {
				const errorMsg = error?.message || 'Unknown error';
				container.innerHTML = `<em style="color: #9ca3af;">Summary not available. Error: ${errorMsg}</em>`;
			}
			// Still try to extract signals from currentData if available
			if (this.currentData && this.currentData.categories) {
				this.extractLegalSignalsFromCategories();
			}
		}
	}

	extractLegalSignals(summaryText) {
		if (!summaryText) return;

		const text = summaryText.toLowerCase();
		
		// Extract ownership information - risk-focused
		const ownershipEl = document.getElementById('signal-ownership');
		if (ownershipEl) {
			if (text.includes('retain ownership') || text.includes('you own') || text.includes('your ownership')) {
				if (text.includes('delete') || text.includes('remove')) {
					ownershipEl.textContent = 'You keep copyright, but the platform may keep copies and a license even if you delete your account.';
				} else {
					ownershipEl.textContent = 'You keep copyright, but the platform may retain a license to use your content.';
				}
			} else if (text.includes('grant') && text.includes('license')) {
				ownershipEl.textContent = 'You keep copyright, but grant the platform broad rights to use your content.';
			} else if (text.includes('intellectual property') || text.includes('ip')) {
				ownershipEl.textContent = 'IP terms apply. Review what rights you retain versus what the platform can use.';
			} else {
				ownershipEl.textContent = 'Check terms to see what ownership rights you keep versus what the platform claims.';
			}
		}

		// Extract license information - risk-focused
		const licenseEl = document.getElementById('signal-license');
		if (licenseEl) {
			if (text.includes('exclusive') || text.includes('transfer')) {
				licenseEl.textContent = 'Platform can use your uploads broadly, including for promotion, new features, or potentially transferring rights.';
			} else if (text.includes('limited') || text.includes('non-exclusive')) {
				licenseEl.textContent = 'Platform can use your uploads to run the service and possibly for promotion or new features.';
			} else if (text.includes('license')) {
				licenseEl.textContent = 'Platform can use your uploads to run the service and possibly for promotion or new features.';
			} else {
				licenseEl.textContent = 'Review terms to understand how the platform can use your content.';
			}
		}

		// Extract restrictions - risk-focused
		const restrictionsEl = document.getElementById('signal-restrictions');
		if (restrictionsEl) {
			const riskParts = [];
			if (text.includes('resale') || text.includes('resell')) {
				riskParts.push('If you resell or misuse content');
			}
			if (text.includes('suspend') || text.includes('terminate') || text.includes('ban')) {
				riskParts.push('your account and access to paid features may be suspended or terminated');
			} else if (text.includes('account') && (text.includes('close') || text.includes('remove'))) {
				riskParts.push('your account may be closed');
			}
			if (text.includes('unauthorized') || text.includes('copying')) {
				if (!riskParts.length) riskParts.push('Unauthorized copying or use');
				riskParts.push('may result in account action');
			}
			if (text.includes('commercial use') && text.includes('prohibited')) {
				if (!riskParts.length) riskParts.push('Commercial use violations');
				riskParts.push('may lead to restrictions');
			}
			if (riskParts.length > 0) {
				restrictionsEl.textContent = riskParts.join(', ') + '.';
			} else if (text.includes('privacy') || text.includes('data')) {
				restrictionsEl.textContent = 'Privacy violations may result in account restrictions or data access limitations.';
			} else {
				restrictionsEl.textContent = 'Review terms to understand what actions could result in account suspension or content removal.';
			}
		}

		// Extract age requirements - risk-focused
		const ageEl = document.getElementById('signal-age');
		if (ageEl) {
			const ageMatch = text.match(/(\d+)\+|\bage\s+(\d+)|must be (\d+)|minimum.*?(\d+)/);
			if (ageMatch) {
				const age = ageMatch[1] || ageMatch[2] || ageMatch[3] || ageMatch[4];
				ageEl.textContent = `If you're under ${age}, the account may be invalid and parents/guardians may be held responsible.`;
			} else if (text.includes('18') || text.includes('adult') || text.includes('age of majority')) {
				ageEl.textContent = 'If you\'re under 18, the account may be invalid and parents/guardians may be held responsible.';
			} else if (text.includes('13') || text.includes('coppa')) {
				ageEl.textContent = 'If you\'re under 13, the account may be invalid and parents/guardians may be held responsible.';
			} else {
				ageEl.textContent = 'Check age requirements—underage accounts may be invalid and parents may be held responsible.';
			}
		}

		// Extract changes/updates policy - risk-focused
		const changesEl = document.getElementById('signal-changes');
		if (changesEl) {
			if (text.includes('update') || text.includes('modify') || text.includes('change')) {
				changesEl.textContent = 'Terms can change; continuing to use the service means you accept the new rules.';
			} else {
				changesEl.textContent = 'Review terms—they may change, and continued use typically means acceptance of new rules.';
			}
		}

		// Extract AI policy - risk-focused
		const aiEl = document.getElementById('signal-ai');
		if (aiEl) {
			if (text.includes('ai') || text.includes('artificial intelligence') || text.includes('machine learning')) {
				if (text.includes('train') || text.includes('training') || text.includes('model')) {
					aiEl.textContent = 'Your uploads may be used to train or improve AI tools unless the policy or settings say otherwise.';
				} else {
					aiEl.textContent = 'Your data may be used for AI features. Check if you can opt out or control this usage.';
				}
			} else {
				aiEl.textContent = 'AI usage not explicitly mentioned. Your data may still be used for AI features unless stated otherwise.';
			}
		}
	}

	extractLegalSignalsFromCategories() {
		// Fallback: extract signals from detected categories when summary is not available
		if (!this.currentData || !this.currentData.categories) return;

		const categories = this.currentData.categories;
		const ownershipEl = document.getElementById('signal-ownership');
		const licenseEl = document.getElementById('signal-license');
		const restrictionsEl = document.getElementById('signal-restrictions');
		const ageEl = document.getElementById('signal-age');
		const changesEl = document.getElementById('signal-changes');
		const aiEl = document.getElementById('signal-ai');

		// Set based on detected categories - risk-focused
		if (categories['Intellectual Property'] || categories['intellectual_property']) {
			if (ownershipEl) ownershipEl.textContent = 'IP terms apply. Review what rights you retain versus what the platform can use.';
			if (licenseEl) licenseEl.textContent = 'Platform can use your uploads to run the service and possibly for promotion or new features.';
		}

		if (categories['User Conduct'] || categories['user_conduct']) {
			if (restrictionsEl) restrictionsEl.textContent = 'Violations of user conduct rules may result in account suspension or termination.';
		}

		if (categories['Data & Privacy'] || categories['data_&_privacy']) {
			if (restrictionsEl) restrictionsEl.textContent = 'Privacy violations may result in account restrictions or data access limitations.';
		}

		// Check for AI-related categories
		const hasAI = Object.keys(categories).some(cat => 
			cat.toLowerCase().includes('ai') || 
			cat.toLowerCase().includes('artificial intelligence')
		);
		if (aiEl) {
			aiEl.textContent = hasAI ? 'Your uploads may be used to train or improve AI tools unless the policy or settings say otherwise.' : 'AI usage not explicitly mentioned. Your data may still be used for AI features unless stated otherwise.';
		}

		// Set defaults for missing signals
		if (ageEl && !ageEl.textContent || ageEl.textContent === 'Analyzing…') {
			ageEl.textContent = 'Check age requirements—underage accounts may be invalid and parents may be held responsible.';
		}
		if (changesEl && (!changesEl.textContent || changesEl.textContent === 'Analyzing…')) {
			changesEl.textContent = 'Review terms—they may change, and continued use typically means acceptance of new rules.';
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