// CRITICAL: This popup is opened via user gesture (keyboard shortcut or action click)
// We must call sidePanel.open() IMMEDIATELY while the gesture is still valid
(async () => {
    try {
        // Get tab ID - this async operation might expire the gesture
        // So we'll do it as quickly as possible
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id && tab?.id !== 0) {
            throw new Error('No active tab available');
        }

        // CRITICAL: Call sidePanel.open() immediately after getting tab ID
        // Do setOptions and open in quick succession without additional async delays
        
        // Try to open without await for setOptions to preserve gesture
        // But we need await for open() to catch errors
        chrome.sidePanel.setOptions({
            tabId: tab.id,
            path: 'sidepanel.html',
            enabled: true
        }).then(() => {
            // Open immediately - this is the critical call
            return chrome.sidePanel.open({ tabId: tab.id });
        }).then(() => {
            console.log('[LegalGuard popup] Side panel opened successfully');
            window.close();
        }).catch((error) => {
            console.error('[LegalGuard popup] Failed to open side panel:', error);
            window.close();
        });
        
        // Alternative: Try with await if the promise chain approach doesn't work
        // This is less ideal as it adds async delay, but might work if setOptions is fast
        /*
        await chrome.sidePanel.setOptions({
            tabId: tab.id,
            path: 'sidepanel.html',
            enabled: true
        });

        await chrome.sidePanel.open({ tabId: tab.id });
        window.close();
        */
    } catch (error) {
        console.error('[LegalGuard popup] Failed to open side panel:', error);
        window.close();
    }
})();

