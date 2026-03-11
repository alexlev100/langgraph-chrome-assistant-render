/**
 * Content Script for Chrome Extension
 *
 * IMPORTANT: Keep as plain JavaScript in public/ folder.
 * Do NOT include in Vite build - copy via post-build script.
 *
 * This script runs in the context of web pages and can:
 * - Access and modify the DOM
 * - Extract page content for AI processing
 * - Communicate with the background service worker
 * - Inject UI elements into pages
 */

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  // Maximum text length to extract
  MAX_TEXT_LENGTH: 50000,

  // Elements to exclude from text extraction
  EXCLUDED_TAGS: ['script', 'style', 'noscript', 'iframe', 'svg', 'canvas'],

  // Selectors for main content areas (priority order)
  CONTENT_SELECTORS: [
    'article',
    '[role="main"]',
    'main',
    '.post-content',
    '.article-content',
    '.entry-content',
    '#content',
    '.content'
  ],

  // Debounce delay for mutation observer (ms)
  MUTATION_DEBOUNCE: 500
};

// ============================================================================
// Page Content Extraction
// ============================================================================

/**
 * Extract clean text content from the page
 * @returns {string} Extracted text content
 */
function extractPageText() {
  // Try to find main content area first
  let contentElement = null;

  for (const selector of CONFIG.CONTENT_SELECTORS) {
    contentElement = document.querySelector(selector);
    if (contentElement) break;
  }

  // Fall back to body if no main content found
  const root = contentElement || document.body;

  if (!root) return '';

  // Clone to avoid modifying the actual DOM
  const clone = root.cloneNode(true);

  // Remove excluded elements
  CONFIG.EXCLUDED_TAGS.forEach(tag => {
    clone.querySelectorAll(tag).forEach(el => el.remove());
  });

  // Get text content and clean it up
  let text = clone.textContent || '';

  // Normalize whitespace
  text = text
    .replace(/\s+/g, ' ')
    .replace(/\n\s*\n/g, '\n\n')
    .trim();

  // Truncate if too long
  if (text.length > CONFIG.MAX_TEXT_LENGTH) {
    text = text.substring(0, CONFIG.MAX_TEXT_LENGTH) + '... [truncated]';
  }

  return text;
}

/**
 * Extract page metadata
 * @returns {Object} Page metadata
 */
function extractPageMetadata() {
  const metadata = {
    title: document.title || '',
    url: window.location.href,
    domain: window.location.hostname,
    description: '',
    keywords: '',
    author: '',
    publishDate: '',
    language: document.documentElement.lang || 'en'
  };

  // Extract meta tags
  const metaTags = {
    description: ['description', 'og:description', 'twitter:description'],
    keywords: ['keywords'],
    author: ['author', 'article:author'],
    publishDate: ['article:published_time', 'datePublished', 'pubdate']
  };

  for (const [key, names] of Object.entries(metaTags)) {
    for (const name of names) {
      const meta = document.querySelector(
        `meta[name="${name}"], meta[property="${name}"]`
      );
      if (meta?.content) {
        metadata[key] = meta.content;
        break;
      }
    }
  }

  return metadata;
}

/**
 * Extract links from the page
 * @param {number} limit - Maximum number of links to extract
 * @returns {Array} Array of link objects
 */
function extractLinks(limit = 50) {
  const links = [];
  const seen = new Set();

  document.querySelectorAll('a[href]').forEach(anchor => {
    if (links.length >= limit) return;

    const href = anchor.href;
    if (!href || seen.has(href)) return;
    if (href.startsWith('javascript:') || href.startsWith('#')) return;

    seen.add(href);
    links.push({
      url: href,
      text: (anchor.textContent || '').trim().substring(0, 100),
      isExternal: !href.includes(window.location.hostname)
    });
  });

  return links;
}

/**
 * Extract images from the page
 * @param {number} limit - Maximum number of images to extract
 * @returns {Array} Array of image objects
 */
function extractImages(limit = 20) {
  const images = [];
  const seen = new Set();

  document.querySelectorAll('img[src]').forEach(img => {
    if (images.length >= limit) return;

    const src = img.src;
    if (!src || seen.has(src)) return;
    if (src.startsWith('data:')) return; // Skip data URIs

    seen.add(src);
    images.push({
      url: src,
      alt: img.alt || '',
      width: img.naturalWidth || img.width,
      height: img.naturalHeight || img.height
    });
  });

  return images;
}

/**
 * Get complete page context for AI processing
 * @returns {Object} Complete page context
 */
function getPageContext() {
  return {
    metadata: extractPageMetadata(),
    text: extractPageText(),
    links: extractLinks(30),
    images: extractImages(10),
    timestamp: Date.now()
  };
}

// ============================================================================
// Selection Handling
// ============================================================================

/**
 * Get currently selected text on the page
 * @returns {string} Selected text
 */
function getSelectedText() {
  const selection = window.getSelection();
  return selection ? selection.toString().trim() : '';
}

/**
 * Get selection with surrounding context
 * @param {number} contextChars - Number of characters of context on each side
 * @returns {Object} Selection with context
 */
function getSelectionWithContext(contextChars = 200) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) {
    return { text: '', context: '', hasSelection: false };
  }

  const selectedText = selection.toString().trim();
  if (!selectedText) {
    return { text: '', context: '', hasSelection: false };
  }

  // Try to get surrounding context
  const range = selection.getRangeAt(0);
  const container = range.commonAncestorContainer;
  const fullText = container.textContent || '';
  const selectionStart = fullText.indexOf(selectedText);

  if (selectionStart === -1) {
    return { text: selectedText, context: selectedText, hasSelection: true };
  }

  const contextStart = Math.max(0, selectionStart - contextChars);
  const contextEnd = Math.min(fullText.length, selectionStart + selectedText.length + contextChars);
  const context = fullText.substring(contextStart, contextEnd);

  return {
    text: selectedText,
    context: context.trim(),
    hasSelection: true
  };
}

// ============================================================================
// Message Handling
// ============================================================================

/**
 * Handle messages from background script or popup
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('[Content Script] Received message:', message.type);

  switch (message.type) {
    case 'GET_PAGE_CONTEXT':
      sendResponse(getPageContext());
      break;

    case 'GET_PAGE_TEXT':
      sendResponse({ text: extractPageText() });
      break;

    case 'GET_PAGE_METADATA':
      sendResponse(extractPageMetadata());
      break;

    case 'GET_SELECTED_TEXT':
      sendResponse(getSelectionWithContext(message.contextChars || 200));
      break;

    case 'GET_LINKS':
      sendResponse({ links: extractLinks(message.limit || 50) });
      break;

    case 'GET_IMAGES':
      sendResponse({ images: extractImages(message.limit || 20) });
      break;

    case 'PING':
      sendResponse({ status: 'ok', timestamp: Date.now() });
      break;

    case 'HIGHLIGHT_TEXT':
      highlightText(message.text, message.color || '#ffff00');
      sendResponse({ success: true });
      break;

    case 'REMOVE_HIGHLIGHTS':
      removeHighlights();
      sendResponse({ success: true });
      break;

    case 'SCROLL_TO_TEXT':
      const found = scrollToText(message.text);
      sendResponse({ found });
      break;

    default:
      console.warn('[Content Script] Unknown message type:', message.type);
      sendResponse({ error: 'Unknown message type' });
  }

  // Return true to indicate async response
  return true;
});

// ============================================================================
// DOM Manipulation Utilities
// ============================================================================

/**
 * Highlight text on the page
 * @param {string} text - Text to highlight
 * @param {string} color - Highlight color
 */
function highlightText(text, color = '#ffff00') {
  if (!text) return;

  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null,
    false
  );

  const nodesToHighlight = [];

  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.textContent.includes(text)) {
      nodesToHighlight.push(node);
    }
  }

  nodesToHighlight.forEach(node => {
    const parent = node.parentNode;
    if (!parent || parent.classList?.contains('ai-extension-highlight')) return;

    const parts = node.textContent.split(text);
    if (parts.length < 2) return;

    const fragment = document.createDocumentFragment();

    parts.forEach((part, index) => {
      if (part) {
        fragment.appendChild(document.createTextNode(part));
      }

      if (index < parts.length - 1) {
        const highlight = document.createElement('mark');
        highlight.className = 'ai-extension-highlight';
        highlight.style.backgroundColor = color;
        highlight.style.padding = '2px';
        highlight.textContent = text;
        fragment.appendChild(highlight);
      }
    });

    parent.replaceChild(fragment, node);
  });
}

/**
 * Remove all highlights added by the extension
 */
function removeHighlights() {
  document.querySelectorAll('.ai-extension-highlight').forEach(mark => {
    const text = document.createTextNode(mark.textContent);
    mark.parentNode.replaceChild(text, mark);
  });
}

/**
 * Scroll to first occurrence of text on page
 * @param {string} text - Text to scroll to
 * @returns {boolean} Whether text was found
 */
function scrollToText(text) {
  if (!text) return false;

  // Use window.find for simple search
  if (window.find && window.find(text, false, false, true)) {
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      const rect = range.getBoundingClientRect();

      window.scrollTo({
        top: window.scrollY + rect.top - window.innerHeight / 3,
        behavior: 'smooth'
      });

      selection.removeAllRanges();
      return true;
    }
  }

  return false;
}

// ============================================================================
// Page Mutation Observer
// ============================================================================

let mutationDebounceTimer = null;

/**
 * Set up mutation observer to track significant page changes
 */
function setupMutationObserver() {
  const observer = new MutationObserver((mutations) => {
    // Debounce rapid changes
    if (mutationDebounceTimer) {
      clearTimeout(mutationDebounceTimer);
    }

    mutationDebounceTimer = setTimeout(() => {
      // Check if changes are significant (not just style/attribute changes)
      const significantChange = mutations.some(mutation => {
        return mutation.type === 'childList' &&
               mutation.addedNodes.length > 0 &&
               Array.from(mutation.addedNodes).some(
                 node => node.nodeType === Node.ELEMENT_NODE
               );
      });

      if (significantChange) {
        // Notify background script of page content change
        chrome.runtime.sendMessage({
          type: 'PAGE_CONTENT_CHANGED',
          url: window.location.href,
          timestamp: Date.now()
        }).catch(() => {
          // Ignore errors if background script is not ready
        });
      }
    }, CONFIG.MUTATION_DEBOUNCE);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  return observer;
}

// ============================================================================
// Initialization
// ============================================================================

/**
 * Initialize content script
 */
function init() {
  console.log('[Content Script] Initialized on:', window.location.href);

  // Set up mutation observer for SPAs
  if (document.body) {
    setupMutationObserver();
  } else {
    // Wait for body to be available
    const bodyObserver = new MutationObserver(() => {
      if (document.body) {
        bodyObserver.disconnect();
        setupMutationObserver();
      }
    });
    bodyObserver.observe(document.documentElement, { childList: true });
  }

  // Notify background script that content script is ready
  chrome.runtime.sendMessage({
    type: 'CONTENT_SCRIPT_READY',
    url: window.location.href,
    timestamp: Date.now()
  }).catch(() => {
    // Ignore errors if background script is not ready
  });
}

// Run initialization
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
