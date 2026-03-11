const DEBUG_LOGS = false;

const log = (...args) => {
  if (DEBUG_LOGS) {
    console.log('[background]', ...args);
  }
};

chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'GET_PAGE_CONTEXT') {
    handleGetPageContext().then(sendResponse);
    return true;
  }

  if (message?.type === 'DEBUG_TOGGLE') {
    sendResponse({ ok: true });
    return false;
  }

  return false;
});

async function handleGetPageContext() {
  const tab = await getActiveTab();

  if (!tab?.id) {
    return emptyContext();
  }

  if (!isHttpUrl(tab.url)) {
    return {
      title: tab.title || '',
      url: tab.url || '',
      text: '',
      forms: [],
      selection: '',
    };
  }

  try {
    const response = await chrome.tabs.sendMessage(tab.id, { type: 'EXTRACT_PAGE_CONTEXT' });
    if (response) {
      return response;
    }
  } catch (error) {
    log('content script unavailable, fallback to executeScript', error);
  }

  return runFallbackExtraction(tab.id);
}

async function getActiveTab() {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0];
}

function isHttpUrl(url) {
  return typeof url === 'string' && (url.startsWith('http://') || url.startsWith('https://'));
}

function emptyContext() {
  return {
    title: '',
    url: '',
    text: '',
    forms: [],
    selection: '',
  };
}

async function runFallbackExtraction(tabId) {
  try {
    const [result] = await chrome.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title || '',
        url: window.location.href,
        text: (document.body?.innerText || '').slice(0, 5000),
        forms: [],
        selection: String(window.getSelection?.() || '').slice(0, 500),
      }),
    });

    return result?.result || emptyContext();
  } catch (error) {
    log('fallback extraction failed', error);
    return emptyContext();
  }
}
