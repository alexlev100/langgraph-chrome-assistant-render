# Lessons Learned & Troubleshooting

Common issues and solutions from real Chrome AI extension development.

## Table of Contents

- [Frontend Issues](#frontend-issues)
- [Backend/API Issues](#backendapi-issues)
- [LLM Integration Issues](#llm-integration-issues)
- [Extension Messaging Issues](#extension-messaging-issues)
- [Build & Configuration Issues](#build--configuration-issues)
- [Troubleshooting Checklist](#troubleshooting-checklist)

---

## Frontend Issues

### Form Submission Loop

**Problem:** Chat UI wrapped prompt input in `<form>` without calling `event.preventDefault()`. Browser performed full page refresh, clearing state before assistant reply rendered.

**Solution:**
```tsx
// WRONG
<form onSubmit={sendMessage}>

// CORRECT
const sendMessage = async (e: React.FormEvent) => {
  e.preventDefault(); // CRITICAL - prevent refresh
  if (!input.trim() || loading) return;
  // ... rest of logic
};
```

### Markdown Auto-Completion Artifacts

**Problem:** Markdown sanitization helpers running on user-authored messages introduced stray characters (e.g., trailing `**`).

**Solution:** Scope markdown processing to assistant output only:
```typescript
// Only sanitize assistant messages
function formatMessage(msg: Message) {
  if (msg.role === 'assistant') {
    return sanitizeMarkdown(msg.content);
  }
  return msg.content; // Leave user input as-is
}
```

### State Not Updating in WebSocket Handler

**Problem:** WebSocket `onmessage` handler captured stale state due to closure.

**Solution:** Use functional state updates:
```typescript
// WRONG - captures stale messages
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  setMessages([...messages, data]); // messages is stale!
};

// CORRECT - uses latest state
ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  setMessages(prev => [...prev, data]);
};
```

---

## Backend/API Issues

### LangChain Message Serialization

**Problem:** FastAPI endpoints returned 500s because code assumed responses were `dict` objects and called `.get()`. LangChain returns custom message classes.

**Solution:**
```python
# WRONG
response_text = response.get("content")  # Fails on BaseMessage

# CORRECT
from langchain_core.messages import BaseMessage

def extract_content(response) -> str:
    if isinstance(response, BaseMessage):
        return response.content
    if isinstance(response, dict):
        return response.get("content", "")
    return str(response)
```

### CORS Errors

**Problem:** Extension couldn't connect to localhost backend due to CORS.

**Solution:**
```python
from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "chrome-extension://*",  # Allow all extensions
        "http://localhost:*",     # Local development
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
```

### WebSocket Not Working

**Problem:** `/ws/{session_id}` endpoint rejected connections with "upgrade request expected".

**Solution:** Install WebSocket support for Uvicorn:
```bash
# requirements.txt
uvicorn[standard]>=0.27.0  # Includes websockets

# Or manually
pip install websockets wsproto
```

### Session State Not Persisting

**Problem:** Each request created new session, losing conversation history.

**Solution:** Ensure session ID is consistent and state is properly stored:
```python
# Check session retrieval
def get_session(session_id: str) -> AgentState:
    if session_id not in sessions:
        sessions[session_id] = AgentState(messages=[])
    return sessions[session_id]

# Check state mutation
async def chat(session_id: str, request: ChatRequest):
    state = get_session(session_id)
    # ... modify state ...
    sessions[session_id] = state  # Save back!
```

---

## LLM Integration Issues

### Gemini system_instruction Error

**Problem:** `TypeError: unexpected keyword argument 'system_instruction'` when calling `chat.send_message()`.

**Solution:** Gemini SDK doesn't accept `system_instruction` at send time. Prepend context as conversation history:
```python
# WRONG
response = chat.send_message(prompt, system_instruction=context)

# CORRECT - inject as conversation turn
messages = [
    {"role": "user", "content": f"Context for assistant:\n{page_context}"},
    {"role": "model", "content": "I understand the context. How can I help?"},
    {"role": "user", "content": actual_prompt},
]
response = model.generate_content(messages)
```

### response.text ValueError

**Problem:** `ValueError` when accessing `response.text` on a response containing only `function_call`.

**Solution:**
```python
# WRONG
text = response.text  # Fails if only tool calls

# CORRECT
def extract_response_text(response) -> str:
    try:
        # Try candidates first
        for candidate in response.candidates:
            for part in candidate.content.parts:
                if hasattr(part, 'text') and part.text:
                    return part.text
        # Fallback to response.text
        return response.text
    except (ValueError, AttributeError):
        return ""
```

### Tool Call Serialization

**Problem:** `Unable to determine the intended type of the dict` when replaying tool calls to Gemini.

**Solution:** Use snake_case `function_call`, not camelCase:
```python
# WRONG
history.append({"parts": [{"functionCall": {"name": ..., "args": {...}}}]})

# CORRECT
history.append({"parts": [{"function_call": {"name": ..., "args": {...}}}]})
```

### SDK Version Conflicts

**Problem:** `google-generativeai>=0.8.0` conflicts with `langchain-google-genai==1.0.8`.

**Solution:**
```bash
# Option 1: Uninstall LangChain wrapper if not needed
pip uninstall langchain-google-genai

# Option 2: Use compatible versions
google-generativeai>=0.7.0,<0.8.0
langchain-google-genai>=1.0.8
```

### Tool Schema Definition

**Problem:** `genai.types.Schema` objects raised `AttributeError` on SDK 0.8.x.

**Solution:** Use plain Python dicts for tool declarations:
```python
# WRONG
tools = [genai.types.Schema(...)]

# CORRECT
tools = [{
    "name": "search_web",
    "description": "Search the web",
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string", "description": "Search query"}
        },
        "required": ["query"]
    }
}]
```

---

## Extension Messaging Issues

### Missing Receiving End

**Problem:** Background script attempted to message content script on every tab, including `chrome://` or restricted URLs. Console spammed with `runtime.lastError`.

**Solution:**
```typescript
async function sendToContentScript(tabId: number, message: any) {
  // Get tab info first
  const tab = await browser.tabs.get(tabId);

  // Skip restricted URLs
  if (!tab.url || !tab.url.startsWith('http')) {
    return null;
  }

  try {
    return await browser.tabs.sendMessage(tabId, message);
  } catch (error) {
    // Content script not injected - expected on some pages
    if (chrome.runtime.lastError) {
      console.log('Content script unavailable:', chrome.runtime.lastError.message);
    }
    return null;
  }
}
```

### Active Tab Validation

**Problem:** Tabs without IDs (closed or special pages) triggered warnings.

**Solution:**
```typescript
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const tabId = sender.tab?.id;

  // Validate tab exists and has ID
  if (!tabId) {
    sendResponse({ error: 'no_tab', data: null });
    return false;
  }

  // Proceed with valid tab
  handleMessage(tabId, message).then(sendResponse);
  return true;
});
```

### Content Script Not Injected

**Problem:** Content script not available on page load due to timing or permissions.

**Solution:** Always have fallback extraction:
```typescript
async function getPageContext(tabId: number): Promise<PageContext> {
  try {
    // Try declarative content script
    return await browser.tabs.sendMessage(tabId, { type: 'EXTRACT' });
  } catch {
    // Fallback: programmatic injection
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        url: window.location.href,
        text: document.body.innerText.slice(0, 5000),
      }),
    });
    return result.result || { title: '', url: '', text: '' };
  }
}
```

---

## Build & Configuration Issues (Vite)

### CRITICAL: Service Worker Parse Error

**Problem:** `Parse error @:1:1` when listing `background.js` as Vite build entry.

**Root Cause:** Vite attempts to bundle the service worker as an ES module, but Chrome extension service workers have special requirements and can't use ES module imports from node_modules.

**Solution:** Keep service worker as plain JavaScript in `public/` folder, do NOT include in Vite:
```javascript
// vite.config.ts - DO NOT include background.js
export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        // DO NOT add: background: resolve(__dirname, 'public/background.js')
      }
    }
  }
});
```

Copy via post-build script:
```json
{
  "scripts": {
    "build": "vite build && npm run copy-static",
    "copy-static": "cp -r public/* dist/"
  }
}
```

### CRITICAL: Content Script Module Errors

**Problem:** Content script using ES imports fails with "Cannot use import statement outside a module."

**Root Cause:** Content scripts run in webpage context, not as ES modules.

**Solution:** Keep content scripts as plain JavaScript in `public/` folder:
```
extension/
├── public/
│   ├── manifest.json
│   ├── background.js   # Plain JS - NOT bundled
│   ├── content.js      # Plain JS - NOT bundled
│   └── icons/
├── src/
│   └── sidepanel/      # React app - bundled by Vite
│       ├── App.tsx
│       └── main.tsx
└── sidepanel.html      # Entry HTML in root
```

### manifest.json Empty Chunks

**Problem:** Including `manifest.json` in Vite inputs generated empty chunks or corrupted output.

**Solution:** Keep `manifest.json` in `public/` and copy post-build:
```json
// package.json
{
  "scripts": {
    "build": "vite build && cp -r public/* dist/"
  }
}
```

### Side Panel Path Mismatch

**Problem:** "Side panel file path must exist" error after build.

**Root Cause:** HTML entry files are in project root, but Vite outputs them to dist.

**Solution:**
1. Keep `sidepanel.html` in project **root** (not in `public/` or `src/`)
2. Reference it in `vite.config.ts`:
```typescript
input: {
  sidepanel: resolve(__dirname, 'sidepanel.html'),
}
```
3. Verify after build:
```bash
ls dist/
# Should show: sidepanel.html, manifest.json, background.js, content.js, assets/
```

### HTML Entry File Location

**Problem:** Vite can't find `sidepanel.html` when placed in `public/`.

**Solution:** HTML entry points must be in project root, NOT in `public/`:
```
extension/
├── sidepanel.html      # ✓ Entry HTML here
├── popup.html          # ✓ Entry HTML here (if using popup)
├── public/             # Static files only
│   ├── manifest.json
│   └── background.js
├── src/
│   └── sidepanel/
│       └── main.tsx    # Referenced by sidepanel.html
└── vite.config.ts
```

Entry HTML references bundled script:
```html
<!-- sidepanel.html -->
<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Side Panel</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/sidepanel/main.tsx"></script>
  </body>
</html>
```

### Tailwind CSS Not Generating

**Problem:** Only fonts appeared in CSS, no Tailwind utilities generated.

**Root Cause:** Tailwind content paths don't include entry HTML files or use wrong glob patterns.

**Solution:** Ensure `tailwind.config.js` includes ALL template locations:
```javascript
// tailwind.config.js
export default {
  content: [
    './sidepanel.html',      // Entry HTML in root!
    './popup.html',          // Other entry HTML
    './src/**/*.{ts,tsx}',   // Source files
  ],
}
```

Import Tailwind in your CSS entry point:
```css
/* src/sidepanel/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;
```

Import CSS in main.tsx:
```typescript
// src/sidepanel/main.tsx
import './index.css';
import App from './App';
```

### Asset Path Issues

**Problem:** CSS/JS assets load with wrong paths in extension.

**Solution:** Configure Vite output to use consistent paths:
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
});
```

### Chrome API Types Not Found

**Problem:** `Cannot find name 'chrome'` TypeScript errors.

**Solution:**
```bash
npm install -D @types/chrome
```

Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "types": ["chrome"]
  }
}
```

### browser.* vs chrome.* APIs

**Problem:** Using `browser.*` APIs (Firefox style) in Chrome-only extension.

**Solution:** Use `chrome.*` APIs directly for Chrome extensions:
```javascript
// WRONG (Firefox/WebExtension style)
browser.runtime.sendMessage(...)
browser.storage.local.get(...)

// CORRECT (Chrome MV3)
chrome.runtime.sendMessage(...)
chrome.storage.local.get(...)
```

### Cross-Platform Build Script

**Problem:** `cp -r` command fails on Windows.

**Solution:** Use Node.js script for cross-platform compatibility:
```javascript
// scripts/copy-static.js
import { cpSync, existsSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const src = join(root, 'public');
const dest = join(root, 'dist');

if (!existsSync(dest)) {
  mkdirSync(dest, { recursive: true });
}

cpSync(src, dest, { recursive: true });
console.log('Static files copied to dist/');
```

```json
{
  "scripts": {
    "copy-static": "node scripts/copy-static.js"
  }
}
```

### npm audit Downgrades

**Problem:** `npm audit fix --force` downgraded packages, breaking imports.

**Solution:** Pin critical dependencies:
```json
{
  "dependencies": {
    "react-syntax-highlighter": "^15.0.0"
  },
  "overrides": {
    "react-syntax-highlighter": "^15.0.0"
  }
}
```

### Service Worker Import Restrictions

**Problem:** Service worker cannot import from node_modules.

**Root Cause:** Chrome service workers run in isolated context without access to bundled dependencies.

**Solution:** Keep service workers as self-contained plain JavaScript:
```javascript
// public/background.js - NO ES module imports!
// WRONG:
// import { something } from 'some-package';

// CORRECT: Inline all needed code
function helper() {
  // ... implementation
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Use inline functions
  helper();
});
```

If you need complex logic, consider:
1. Keep complex logic in the React UI, message to background for simple tasks
2. Or bundle service worker separately with a tool like esbuild

---

## Troubleshooting Checklist

### Extension Not Loading
- [ ] Check `chrome://extensions` for error messages
- [ ] Verify all files in manifest exist in dist
- [ ] Run `ls -la dist/` after build
- [ ] Check file paths are relative to manifest location

### Content Script Not Running
- [ ] Verify URL matches `matches` pattern
- [ ] Check host_permissions includes target URL
- [ ] Try `runAt: 'document_idle'` vs `'document_start'`
- [ ] Check console in target page for errors

### Backend Not Connecting
- [ ] Verify backend is running: `curl http://localhost:8000/health`
- [ ] Check CORS configuration allows extension origin
- [ ] Verify WebSocket endpoint accepts upgrades
- [ ] Check network tab in extension devtools

### LLM Not Responding
- [ ] Verify API key is set in environment
- [ ] Check for rate limiting (429 errors)
- [ ] Log raw request/response for debugging
- [ ] Try simpler prompt to isolate issue

### State Not Persisting
- [ ] Verify session_id is consistent across requests
- [ ] Check state is saved after modification
- [ ] Log session storage contents
- [ ] Verify Redis/database connection (production)

### WebSocket Issues
- [ ] Verify `uvicorn[standard]` is installed
- [ ] Check WebSocket URL matches backend route
- [ ] Log connection state changes
- [ ] Try REST fallback to isolate issue

---

## Diagnostic Logging

Add comprehensive logging during development:

```python
# Backend logging
import logging
logging.basicConfig(level=logging.DEBUG)

@app.post("/chat/{session_id}")
async def chat(session_id: str, request: ChatRequest):
    logging.debug(f"Session: {session_id}")
    logging.debug(f"Request: {request.model_dump()}")

    # ... process ...

    logging.debug(f"Response: {response}")
    return response
```

```typescript
// Extension logging
const DEBUG = import.meta.env.DEV;

function log(...args: any[]) {
  if (DEBUG) console.log('[Extension]', ...args);
}

// Use throughout
log('Sending message:', message);
log('Received response:', response);
```
