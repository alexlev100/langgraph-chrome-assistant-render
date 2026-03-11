/**
 * Background Service Worker Template
 *
 * IMPORTANT: Keep as plain JavaScript in public/ folder.
 * Do NOT include in Vite build - copy via post-build script.
 *
 * This service worker handles:
 * - Cross-context messaging
 * - Side panel management
 * - Content script communication
 * - Extension lifecycle events
 */

// ============================================================================
// Initialization
// ============================================================================

console.log('[Background] Service worker started');

// Open side panel when action is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// ============================================================================
// Message Handling
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Background] Received:', message.type, 'from tab:', sender.tab?.id);

  switch (message.type) {
    case 'GET_PAGE_CONTEXT':
      getPageContext(sender.tab?.id).then(sendResponse);
      return true; // Async response

    case 'RUN_ACTION':
      handleRunAction(sender.tab?.id).then(sendResponse);
      return true;

    case 'GET_ITEMS':
      getStoredItems().then(sendResponse);
      return true;

    case 'DISMISS_ITEM':
      dismissItem(message.itemId).then(sendResponse);
      return true;

    default:
      sendResponse({ error: 'Unknown message type' });
      return false;
  }
});

// ============================================================================
// Page Context Extraction
// ============================================================================

async function getPageContext(tabId) {
  if (!tabId) {
    return { title: '', url: '', text: '', forms: [] };
  }

  // Check if URL is accessible
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith('http')) {
      return {
        title: tab.title || '',
        url: tab.url || '',
        text: '',
        forms: []
      };
    }
  } catch (error) {
    console.warn('[Background] Could not get tab:', error);
    return { title: '', url: '', text: '', forms: [] };
  }

  // Try content script first
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' });
    return response;
  } catch (error) {
    console.log('[Background] Content script unavailable, using fallback');
  }

  // Fallback: execute script directly
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        url: window.location.href,
        text: document.body.innerText.slice(0, 5000),
        forms: [],
      }),
    });
    return result?.result || { title: '', url: '', text: '', forms: [] };
  } catch (error) {
    console.error('[Background] Fallback extraction failed:', error);
    return { title: '', url: '', text: '', forms: [] };
  }
}

// ============================================================================
// Action Handling
// ============================================================================

async function handleRunAction(tabId) {
  try {
    // Get page context
    const pageContext = await getPageContext(tabId);

    // Here you would typically:
    // 1. Send to your backend API
    // 2. Process with native messaging
    // 3. Run local processing

    // Mock processing delay
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Store result
    const result = {
      id: crypto.randomUUID(),
      title: 'Processed Result',
      content: `Analyzed page: ${pageContext.title}`,
      category: 'Analysis',
      timestamp: Date.now(),
    };

    await addItem(result);

    // Notify side panel
    try {
      await chrome.runtime.sendMessage({
        type: 'NEW_ITEM',
        item: result,
      });
    } catch (e) {
      // Side panel might not be open
    }

    return { success: true, item: result };
  } catch (error) {
    console.error('[Background] Action failed:', error);
    return { success: false, error: error.message };
  }
}

// ============================================================================
// Storage
// ============================================================================

async function getStoredItems() {
  const result = await chrome.storage.local.get(['items', 'dismissedIds']);
  const items = result.items || [];
  const dismissedIds = result.dismissedIds || [];
  return {
    items: items.filter(item => !dismissedIds.includes(item.id))
  };
}

async function addItem(item) {
  const result = await chrome.storage.local.get('items');
  const items = result.items || [];
  items.unshift(item);
  await chrome.storage.local.set({ items: items.slice(0, 100) }); // Keep last 100
}

async function dismissItem(itemId) {
  const result = await chrome.storage.local.get('dismissedIds');
  const dismissedIds = result.dismissedIds || [];
  dismissedIds.push(itemId);
  await chrome.storage.local.set({ dismissedIds });
  return { success: true };
}

// ============================================================================
// Extension Lifecycle
// ============================================================================

chrome.runtime.onInstalled.addListener((details) => {
  console.log('[Background] Extension installed/updated:', details.reason);

  if (details.reason === 'install') {
    // First install - initialize storage
    chrome.storage.local.set({
      items: [],
      dismissedIds: [],
      settings: {
        enabled: true,
        apiUrl: 'http://localhost:8000',
      },
    });
  }
});

// ============================================================================
// Alarms (Optional: Periodic Tasks)
// ============================================================================

chrome.alarms.create('periodic-check', { periodInMinutes: 30 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'periodic-check') {
    console.log('[Background] Running periodic check');
    // Perform periodic task (e.g., sync, cleanup)
  }
});
