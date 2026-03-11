const DEBUG_LOGS = false;

const MAX_TEXT_LENGTH = 50000;
const MAX_FORM_FIELDS = 20;
const MAX_FORMS = 8;

const log = (...args) => {
  if (DEBUG_LOGS) {
    console.log('[content]', ...args);
  }
};

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'EXTRACT_PAGE_CONTEXT') {
    sendResponse(extractPageContext());
    return false;
  }

  return false;
});

function extractPageContext() {
  try {
    return {
      title: document.title || '',
      url: window.location.href,
      text: extractText(),
      forms: extractForms(),
      selection: String(window.getSelection?.() || '').slice(0, 500),
    };
  } catch (error) {
    log('extractPageContext failed', error);
    return {
      title: document.title || '',
      url: window.location.href,
      text: '',
      forms: [],
      selection: '',
    };
  }
}

function extractText() {
  const root = document.querySelector('main, article, [role="main"]') || document.body;
  if (!root) {
    return '';
  }

  const clone = root.cloneNode(true);
  clone.querySelectorAll('script, style, noscript, iframe, svg, canvas').forEach((node) => node.remove());

  return (clone.textContent || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_TEXT_LENGTH);
}

function extractForms() {
  const forms = Array.from(document.forms || []).slice(0, MAX_FORMS);

  return forms.map((form, index) => {
    const fields = Array.from(form.elements || [])
      .filter((el) => ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName))
      .slice(0, MAX_FORM_FIELDS)
      .map((field) => ({
        name: field.name || '',
        type: field.type || field.tagName.toLowerCase(),
        required: Boolean(field.required),
        label: inferLabel(field),
      }));

    return {
      id: form.id || `form_${index}`,
      method: (form.method || 'GET').toUpperCase(),
      action: form.action || '',
      fields,
    };
  });
}

function inferLabel(field) {
  if (field.id) {
    const direct = document.querySelector(`label[for="${field.id}"]`);
    if (direct?.textContent) {
      return direct.textContent.trim();
    }
  }

  const parentLabel = field.closest('label');
  if (parentLabel?.textContent) {
    return parentLabel.textContent.trim();
  }

  return field.getAttribute('aria-label') || field.placeholder || '';
}
