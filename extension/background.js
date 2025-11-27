// background.js - sidePanel user-gesture compliant behavior

const hasChrome = typeof chrome !== 'undefined';
const hasRuntime = !!(hasChrome && chrome.runtime);
const hasAction = !!(hasChrome && chrome.action);
const hasContextMenus = !!(hasChrome && chrome.contextMenus);
const hasSidePanel = !!(hasChrome && chrome.sidePanel);
const hasScripting = !!(hasChrome && chrome.scripting);
const hasTabs = !!(hasChrome && chrome.tabs);
const hasCommands = !!(hasChrome && chrome.commands);

console.log('background.js boot', { hasSidePanel });

// Defensive PING to verify API availability
async function verifySidePanelAPI() {
    if (!hasSidePanel) {
        console.error('[LG] sidePanel API not available');
        return false;
    }
    
    try {
        // Test if we can access the API
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        console.log('[LG] sidePanel API verified');
        return true;
    } catch (e) {
        console.error('[LG] sidePanel API verification failed:', e);
        return false;
    }
}

async function setBehavior() {
    if (!hasSidePanel || !chrome.sidePanel.setPanelBehavior) return;
    try {
        await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
        console.log('[LG] sidePanel behavior set: open on action click');
    } catch (e) {
        console.warn('[LG] setPanelBehavior failed', e);
    }
}

// Canonical open flow - single source of truth
async function openSidePanelForTab(tabId) {
    if (!hasSidePanel) {
        throw new Error('sidePanel API not available');
    }
    if (typeof tabId !== 'number' || tabId < 0) {
        throw new Error('Invalid tabId');
    }

    console.log('[LG] Opening side panel for tab:', tabId);
    
    try {
        // Always set options first
        await chrome.sidePanel.setOptions({ 
            tabId, 
            path: 'sidepanel.html', 
            enabled: true 
        });
        console.log('[LG] Side panel options set for tab:', tabId);
        
        // Then open it
        await chrome.sidePanel.open({ tabId });
        console.log('[LG] Side panel opened for tab:', tabId);
        
        return true;
    } catch (e) {
        console.error('[LG] Failed to open side panel for tab:', tabId, e);
        throw e;
    }
}

async function getActiveTabId() {
    if (!hasTabs) {
        throw new Error('tabs API not available');
    }
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id && tab?.id !== 0) {
        throw new Error('No active tab found');
    }
    return tab.id;
}

async function openSidePanelFrom(sender) {
    try {
        const tabId = sender?.tab?.id ?? (await getActiveTabId());
        await chrome.sidePanel.setOptions({
            tabId,
            path: 'sidepanel.html',
            enabled: true
        });
        await chrome.sidePanel.open({ tabId });
        console.log('[LG] Side panel opened from message for tab:', tabId);
        return true;
    } catch (e) {
        console.error('[LG] Failed to open side panel:', e);
        if (String(e?.message || e).toLowerCase().includes('user gesture')) {
            try {
                console.warn('[LG] Attempting fallback via action popup to preserve gesture chain');
                await chrome.action.openPopup();
            } catch (popupError) {
                console.error('[LG] Fallback openPopup failed:', popupError);
                throw popupError;
            }
        } else {
            throw e;
        }
    }
}

async function getBestTabId(sender) {
    // Prefer sender tab ID
    const id = sender?.tab?.id;
    if (typeof id === 'number' && id >= 0) {
        console.log('[LG] Using sender tab ID:', id);
        return id;
    }
    
    // Fallback to active tab
    if (hasTabs) {
        try {
            const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (active?.id >= 0) {
                console.log('[LG] Using active tab ID:', active.id);
                return active.id;
            }
        } catch (e) {
            console.warn('[LG] Failed to get active tab:', e);
        }
    }
    
    throw new Error('No tabId available');
}

// Create context menu function
async function createContextMenu() {
    if (!hasContextMenus) return;
    
    try {
        // Remove existing menu if it exists (to avoid duplicate errors)
        try {
            chrome.contextMenus.remove('lg-open-analysis');
        } catch (e) {
            // Ignore if it doesn't exist
        }
        
        chrome.contextMenus.create({
            id: 'lg-open-analysis',
            title: 'Explain',
            contexts: ['page', 'selection', 'link']
        });
        console.log('[LG] Context menu created');
    } catch (e) {
        console.warn('[LG] Context menu creation failed:', e);
    }
}

// Install / startup
if (hasRuntime) {
    chrome.runtime.onInstalled.addListener(async () => {
        console.log('[LG] Extension installed/updated');
        await verifySidePanelAPI();
        setBehavior();
        await createContextMenu();
    });
    
    // Try set behavior and create context menu on each startup, too
    setBehavior();
    createContextMenu();
}

// Toolbar icon click — always opens (valid user gesture)
if (hasAction && chrome.action.onClicked?.addListener) {
    chrome.action.onClicked.addListener(async (tab) => {
        try {
            console.log('[LG] Action icon clicked for tab:', tab?.id);
            const tabId = tab?.id ?? (await getBestTabId({}));
            await openSidePanelForTab(tabId);
        } catch (e) {
            console.error('[LG] Action click open failed:', e?.message || e);
        }
    });
}

// Context menu — valid user gesture
if (hasContextMenus && chrome.contextMenus.onClicked?.addListener) {
    chrome.contextMenus.onClicked.addListener((info, tab) => {
        if (info.menuItemId !== 'lg-open-analysis') return;
        
        console.log('[LG] Context menu "Explain" clicked, tab:', tab?.id, 'selection:', info.selectionText?.substring(0, 50));
        
        // CRITICAL: Open side panel IMMEDIATELY to preserve user gesture
        // Use windowId approach (more gesture-friendly) like keyboard shortcut
        const tabId = tab?.id;
        const windowId = tab?.windowId;
        
        // Store selected text (doesn't need user gesture, can happen in parallel)
        const selectedText = info.selectionText || '';
        if (selectedText && selectedText.trim() && typeof tabId === 'number' && tabId >= 0) {
            chrome.storage.local.set({
                [`lg:selectedText:${tabId}`]: {
                    text: selectedText.trim(),
                    timestamp: Date.now()
                }
            }).then(() => {
                console.log('[LG] Stored selected text for tab:', tabId, 'length:', selectedText.length);
            }).catch(e => {
                console.warn('[LG] Failed to store selected text:', e);
            });
        }
        
        // Try windowId first (more gesture-friendly)
        if (typeof windowId === 'number' && windowId >= 0) {
            console.log('[LG] Opening side panel with windowId:', windowId);
            chrome.sidePanel.open({ windowId }).then(() => {
                console.log('[LG] Side panel opened successfully via windowId');
            }).catch(e => {
                console.warn('[LG] Opening with windowId failed, trying tabId:', e);
                // Fallback to tabId
                if (typeof tabId === 'number' && tabId >= 0) {
                    openSidePanelForTab(tabId).catch(err => {
                        console.error('[LG] Context menu open failed:', err?.message || err);
                    });
                }
            });
        } else if (typeof tabId === 'number' && tabId >= 0) {
            // Fallback to tabId if windowId not available
            console.log('[LG] Opening side panel with tabId:', tabId);
            openSidePanelForTab(tabId).catch(e => {
                console.error('[LG] Context menu open failed:', e?.message || e);
            });
        } else {
            console.error('[LG] No valid tabId or windowId in context menu');
        }
    });
}

// Commands keyboard shortcut — valid user gesture
// CRITICAL: chrome.commands.onCommand provides a user gesture, but it expires quickly
// We must minimize async operations before calling chrome.sidePanel.open()
// According to Chrome docs, we can use windowId instead of tabId for better gesture preservation
if (hasCommands && chrome.commands?.onCommand?.addListener) {
    chrome.commands.onCommand.addListener((command) => {
        if (command !== 'lg-open-panel') {
            console.log('[LG] Ignoring command:', command);
            return;
        }
        
        console.log('[LG] Keyboard shortcut Alt+L triggered (user gesture active)');
        
        // CRITICAL: Use windowId approach which is more gesture-friendly
        // First try to get the current window ID (synchronous property access if possible)
        chrome.windows.getCurrent((window) => {
            if (window?.id) {
                const windowId = window.id;
                console.log('[LG] Got window ID:', windowId, 'opening side panel immediately');
                
                // Try opening with windowId first (more reliable for gestures)
                // Since we have a default_path in manifest, we might not need setOptions
                chrome.sidePanel.open({ windowId: windowId }).then(() => {
                    console.log('[LG] Side panel opened successfully via Alt+L (windowId)');
                }).catch((openError) => {
                    console.warn('[LG] Opening with windowId failed, trying tabId approach:', openError);
                    
                    // Fallback: use tabId approach
                    chrome.tabs.query({ active: true, windowId: windowId }, (tabs) => {
                        if (tabs && tabs[0]?.id !== undefined && tabs[0].id >= 0) {
                            const tabId = tabs[0].id;
                            
                            // Set options and open in quick succession
                            chrome.sidePanel.setOptions({
                                tabId: tabId,
                                path: 'sidepanel.html',
                                enabled: true
                            }).then(() => {
                                return chrome.sidePanel.open({ tabId: tabId });
                            }).then(() => {
                                console.log('[LG] Side panel opened successfully via Alt+L (tabId)');
                            }).catch((tabError) => {
                                console.error('[LG] Failed to open side panel with tabId:', tabError);
                            });
                        } else {
                            console.error('[LG] Could not get active tab for window:', windowId);
                        }
                    });
                });
            } else {
                console.error('[LG] Could not get current window ID');
                // Last resort: try with active tab
                chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                    if (tabs && tabs[0]?.id !== undefined && tabs[0].id >= 0) {
                        chrome.sidePanel.setOptions({
                            tabId: tabs[0].id,
                            path: 'sidepanel.html',
                            enabled: true
                        }).then(() => {
                            return chrome.sidePanel.open({ tabId: tabs[0].id });
                        }).then(() => {
                            console.log('[LG] Side panel opened via Alt+L (fallback)');
                        }).catch((error) => {
                            console.error('[LG] Fallback open failed:', error);
                        });
                    }
                });
            }
        });
    });
    console.log('[LG] Keyboard shortcut listener registered for Alt+L (using windowId for better gesture preservation)');
} else {
    console.warn('[LG] Commands API not available, keyboard shortcut will not work');
}

// Message bridge from content scripts
if (hasRuntime && chrome.runtime.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
        const messageType = request?.type || request?.action;
        console.log('[LG] Message received:', messageType, 'from tab:', sender?.tab?.id);
        
        if (request?.type === 'OPEN_SIDE_PANEL') {
            try {
                const popupPromise = chrome.action?.openPopup?.();
                if (popupPromise && typeof popupPromise.then === 'function') {
                    popupPromise.catch((err) => console.error('[LG] openPopup failed:', err));
                }
            } catch (err) {
                console.error('[LG] openPopup threw synchronously:', err);
            }
            sendResponse?.({ success: true });
            return false;
        }
        
        // Handle openSidePanel action - use the existing user gesture handlers
        if (request?.action === 'openSidePanel') {
            // Instead of trying to open directly, trigger the action icon click
            // This preserves the user gesture context
            try {
                console.log('[LG] Triggering action icon click for tab:', sender?.tab?.id);
                
                // Get the tab ID
                const tabId = sender?.tab?.id;
                if (!tabId) {
                    sendResponse({ success: false, error: 'No tab ID available' });
                    return;
                }
                
                // Use the existing openSidePanelForTab function
                openSidePanelForTab(tabId)
                    .then(() => {
                        console.log('[LG] Side panel opened successfully via action trigger');
                        sendResponse({ success: true });
                    })
                    .catch(e => {
                        console.error('[LG] Side panel open failed via action trigger:', e);
                        sendResponse({ success: false, error: e?.message || String(e) });
                    });
            } catch (e) {
                console.error('[LG] Failed to trigger side panel open:', e);
                sendResponse({ success: false, error: e?.message || String(e) });
            }
            return true;
        }

        // Handle analysisComplete action
        if (request?.action === 'analysisComplete') {
            try {
                const tabId = sender?.tab?.id;
                if (tabId) {
                    chrome.storage.local.set({
                        [`lg:analysis:${tabId}`]: request.data
                    });
                    console.log('[LG] Analysis data stored for tab:', tabId);
                }
                sendResponse({ success: true });
            } catch (e) {
                console.error('[LG] Failed to store analysis data:', e);
                sendResponse({ success: false, error: e?.message || String(e) });
            }
            return true;
        }

        // Prep only: set options + enable, no open() (does NOT require user gesture)
        if (request?.action === 'prepSidePanel') {
            getBestTabId(sender)
                .then(tabId => chrome.sidePanel.setOptions({ tabId, path: 'sidepanel.html', enabled: true }))
                .then(() => {
                    console.log('[LG] Side panel prepped for tab:', sender?.tab?.id);
                    sendResponse({ success: true });
                })
                .catch(e => {
                    console.error('[LG] Side panel prep failed:', e);
                    sendResponse({ success: false, error: e?.message || String(e) });
                });
            return true;
        }
        
        // If no action matches, don't return true
        return false;
    });
}
