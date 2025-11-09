(async () => {
    try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab?.id && tab?.id !== 0) {
            throw new Error('No active tab available');
        }

        await chrome.sidePanel.setOptions({
            tabId: tab.id,
            path: 'sidepanel.html',
            enabled: true
        });

        await chrome.sidePanel.open({ tabId: tab.id });
    } catch (error) {
        console.error('[LegalGuard popup] Failed to open side panel:', error);
    } finally {
        window.close();
    }
})();

