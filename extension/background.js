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

// Install / startup
if (hasRuntime) {
    chrome.runtime.onInstalled.addListener(async () => {
        console.log('[LG] Extension installed/updated');
        await verifySidePanelAPI();
        setBehavior();
        
        if (hasContextMenus) {
            try {
                chrome.contextMenus.create({
                    id: 'lg-open-analysis',
                    title: 'See full analysis (Side Panel)',
                    contexts: ['page', 'selection', 'link']
                });
                console.log('[LG] Context menu created');
            } catch (e) {
                console.warn('[LG] Context menu creation failed:', e);
            }
        }
    });
    
    // Try set behavior on each startup, too
    setBehavior();
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
    chrome.contextMenus.onClicked.addListener(async (info, tab) => {
        if (info.menuItemId !== 'lg-open-analysis') return;
        try {
            console.log('[LG] Context menu clicked for tab:', tab?.id);
            const tabId = tab?.id ?? (await getBestTabId({}));
            await openSidePanelForTab(tabId);
        } catch (e) {
            console.error('[LG] Context menu open failed:', e?.message || e);
        }
    });
}

// Commands keyboard shortcut — valid user gesture
if (hasCommands && chrome.commands.onCommand?.addListener) {
    chrome.commands.onCommand.addListener(async (command) => {
        if (command !== 'lg-open-panel') return;
        try {
            console.log('[LG] Keyboard shortcut triggered');
            const tabId = await getBestTabId({});
            await openSidePanelForTab(tabId);
        } catch (e) {
            console.error('[LG] Command open failed:', e?.message || e);
        }
    });
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
