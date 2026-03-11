---
name: chrome-ai-extension-builder
description: Build Chrome MV3 extensions with AI-powered Python backends. Use when creating browser extensions with LangGraph agents, FastAPI backends, Gemini/Claude LLM integration, or real-time WebSocket communication. Covers Vite build setup (React, TypeScript, shadcn-ui), content scripts, side panels, manifest configuration, and full-stack extension architecture connecting to Python AI services.
---

# Chrome AI Extension Builder

Build production-ready Chrome MV3 extensions with AI-powered Python backends using Vite + FastAPI + LangGraph.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                Chrome Extension (Vite + React)                   │
├─────────────────────────────────────────────────────────────────┤
│  Side Panel (React)  ←→  Background.js  ←→  Content Script      │
│       ↓                      ↓                    ↓              │
│  WebSocket Client      chrome.runtime         DOM Scraping       │
│  REST Fallback         .sendMessage           Page Context       │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTP/WebSocket
              ┌───────────────┴───────────────┐
              │     FastAPI Backend           │
              │  POST /chat/{session_id}      │
              │  WS /ws/{session_id}          │
              └───────────────┬───────────────┘
                              ↓
              ┌───────────────┴───────────────┐
              │   LangGraph Agent             │
              │   (Stateful AI workflows)     │
              └───────────────┬───────────────┘
                              ↓
         ┌────────────────────┼────────────────────┐
         ↓                    ↓                    ↓
    Gemini/Claude         EXA Research        Custom Tools
       (LLM)                 API
```

---

## Quick Start

### Extension (Frontend)

```bash
mkdir my-extension && cd my-extension
npm init -y
npm install react react-dom
npm install -D vite @vitejs/plugin-react typescript @types/react @types/react-dom @types/chrome
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
npx shadcn@latest init
```

### Backend (Python)

```bash
mkdir backend && cd backend
python -m venv venv && source venv/bin/activate
pip install fastapi "uvicorn[standard]" langgraph langchain-google-genai pydantic python-dotenv
```

---

## Project Structure

```
/project-root
├── extension/                    # Chrome extension (Vite)
│   ├── src/
│   │   ├── sidepanel/            # Side panel React app
│   │   │   ├── App.tsx
│   │   │   ├── main.tsx
│   │   │   └── index.css
│   │   ├── components/ui/        # shadcn components
│   │   └── lib/
│   │       ├── api.ts            # Backend API client
│   │       └── types.ts          # Shared types
│   ├── public/
│   │   ├── manifest.json         # Extension manifest
│   │   ├── background.js         # Service worker (NOT bundled)
│   │   ├── content.js            # Content script (NOT bundled)
│   │   └── icons/
│   ├── sidepanel.html            # Side panel entry
│   ├── vite.config.ts
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                      # Python FastAPI
│   ├── main.py                   # FastAPI app + routes
│   ├── agent.py                  # LangGraph agent
│   ├── state.py                  # Agent state definition
│   ├── tools.py                  # LLM tools (EXA, etc.)
│   ├── requirements.txt
│   └── .env
│
└── .gitignore
```

---

## Extension Setup (Vite)

### manifest.json

```json
{
  "manifest_version": 3,
  "name": "AI Assistant",
  "version": "0.1.0",
  "description": "AI-powered browser assistant",

  "permissions": [
    "storage",
    "activeTab",
    "scripting",
    "sidePanel"
  ],

  "host_permissions": [
    "<all_urls>"
  ],

  "action": {
    "default_title": "Open AI Assistant",
    "default_icon": {
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    }
  },

  "side_panel": {
    "default_path": "sidepanel.html"
  },

  "background": {
    "service_worker": "background.js",
    "type": "module"
  },

  "content_scripts": [
    {
      "matches": ["<all_urls>"],
      "js": ["content.js"],
      "run_at": "document_idle"
    }
  ],

  "icons": {
    "16": "icons/icon-16.png",
    "32": "icons/icon-32.png",
    "48": "icons/icon-48.png",
    "128": "icons/icon-128.png"
  },

  "commands": {
    "_execute_action": {
      "suggested_key": {
        "default": "Ctrl+Shift+E",
        "mac": "Command+Shift+E"
      }
    }
  },

  "minimum_chrome_version": "120"
}
```

### vite.config.ts

```typescript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  plugins: [react()],

  build: {
    outDir: 'dist',
    emptyDirBeforeWrite: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, 'sidepanel.html'),
        // Add popup if needed: popup: resolve(__dirname, 'popup.html'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
    sourcemap: process.env.NODE_ENV === 'development',
  },

  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
});
```

### package.json

```json
{
  "name": "ai-extension",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite build --watch",
    "build": "vite build && npm run copy-static",
    "copy-static": "cp -r public/* dist/",
    "preview": "vite preview",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0"
  },
  "devDependencies": {
    "@types/chrome": "^0.0.260",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.7.0",
    "vite": "^5.4.0"
  }
}
```

### Background Service Worker

```javascript
// public/background.js
// IMPORTANT: Keep as plain JS in public/, NOT bundled by Vite

// Open side panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

// Handle messages from content script and side panel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTEXT') {
    getPageContext(sender.tab?.id).then(sendResponse);
    return true; // Async response
  }
});

async function getPageContext(tabId) {
  if (!tabId) return { title: '', url: '', text: '', forms: [] };

  // Check if URL is accessible
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab.url || !tab.url.startsWith('http')) {
      return { title: tab.title || '', url: tab.url || '', text: '', forms: [] };
    }
  } catch {
    return { title: '', url: '', text: '', forms: [] };
  }

  try {
    // Try content script first
    return await chrome.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' });
  } catch {
    // Fallback: execute script directly
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
  }
}
```

### Content Script

```javascript
// public/content.js
// IMPORTANT: Keep as plain JS in public/, NOT bundled by Vite

// Listen for extraction requests from background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'EXTRACT_PAGE') {
    sendResponse(extractPageContext());
  }
  return false;
});

function extractPageContext() {
  return {
    title: document.title,
    url: window.location.href,
    text: document.body.innerText.slice(0, 5000),
    forms: extractForms(),
  };
}

function extractForms() {
  return Array.from(document.forms).slice(0, 5).map((form, i) => ({
    id: form.id || `form_${i}`,
    action: form.action,
    method: form.method,
    fields: Array.from(form.elements)
      .filter(el => el.name)
      .slice(0, 20)
      .map(el => ({
        name: el.name,
        type: el.type,
        value: (el.value || '').slice(0, 100),
      })),
  }));
}

console.log('[AI Assistant] Content script loaded');
```

### Side Panel HTML

```html
<!-- sidepanel.html (in project root, NOT in public/) -->
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AI Assistant</title>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/sidepanel/main.tsx"></script>
</body>
</html>
```

### Side Panel React App

```tsx
// src/sidepanel/main.tsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

```tsx
// src/sidepanel/App.tsx
import { useState, useEffect, useRef } from 'react';

const API_URL = 'http://localhost:8000';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface PageContext {
  title: string;
  url: string;
  text: string;
  forms?: any[];
}

export default function App() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => crypto.randomUUID());
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('disconnected');
  const wsRef = useRef<WebSocket | null>(null);

  // Connect WebSocket
  useEffect(() => {
    const ws = new WebSocket(`ws://localhost:8000/ws/${sessionId}`);

    ws.onopen = () => setWsStatus('connected');
    ws.onclose = () => setWsStatus('disconnected');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'token') {
        setMessages(prev => updateLastAssistant(prev, data.content));
      } else if (data.type === 'done') {
        setLoading(false);
      } else if (data.type === 'error') {
        setLoading(false);
        console.error('WebSocket error:', data.message);
      }
    };

    wsRef.current = ws;
    return () => ws.close();
  }, [sessionId]);

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault(); // CRITICAL: Prevent form refresh
    if (!input.trim() || loading) return;

    // Get page context from background
    let pageContext: PageContext = { title: '', url: '', text: '' };
    try {
      pageContext = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT' });
    } catch (err) {
      console.warn('Could not get page context:', err);
    }

    const userMessage = { role: 'user' as const, content: input };
    setMessages(prev => [...prev, userMessage, { role: 'assistant', content: '' }]);
    setInput('');
    setLoading(true);

    const payload = {
      message: input,
      page_content: formatPageContext(pageContext),
      page_details: pageContext,
    };

    // Try WebSocket first
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
      return;
    }

    // Fall back to REST
    try {
      const response = await fetch(`${API_URL}/chat/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await response.json();
      setMessages(prev => updateLastAssistant(prev, data.response));
    } catch (err) {
      console.error('API error:', err);
      setMessages(prev => updateLastAssistant(prev, 'Error: Could not connect to server'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Header */}
      <header className="p-3 border-b flex items-center justify-between">
        <h1 className="font-semibold">AI Assistant</h1>
        <span className={`text-xs px-2 py-1 rounded ${
          wsStatus === 'connected' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {wsStatus}
        </span>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            Ask me anything about this page...
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[80%] p-3 rounded-lg ${
              msg.role === 'user'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted'
            }`}>
              {msg.content || (loading && msg.role === 'assistant' ? '...' : '')}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <form onSubmit={sendMessage} className="p-4 border-t">
        <div className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask about this page..."
            className="flex-1 px-3 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-primary"
            disabled={loading}
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-md disabled:opacity-50"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

function formatPageContext(ctx: PageContext): string {
  return `Page: ${ctx.title}\nURL: ${ctx.url}\n\n${ctx.text?.slice(0, 3000) || ''}`;
}

function updateLastAssistant(messages: Message[], content: string): Message[] {
  const updated = [...messages];
  const last = updated[updated.length - 1];
  if (last?.role === 'assistant') {
    updated[updated.length - 1] = { ...last, content: last.content + content };
  }
  return updated;
}
```

### Tailwind CSS Setup

```javascript
// tailwind.config.js
/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ['class'],
  content: [
    './sidepanel.html',
    './popup.html',
    './src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
      },
    },
  },
  plugins: [],
};
```

```css
/* src/sidepanel/index.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --background: 0 0% 100%;
  --foreground: 222.2 84% 4.9%;
  --primary: 222.2 47.4% 11.2%;
  --primary-foreground: 210 40% 98%;
  --muted: 210 40% 96.1%;
  --muted-foreground: 215.4 16.3% 46.9%;
}

body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
}
```

---

## Python Backend Setup

### requirements.txt

```
fastapi>=0.109.0
uvicorn[standard]>=0.27.0
langgraph>=0.0.40
langchain-google-genai>=1.0.0
google-generativeai>=0.8.0
pydantic>=2.0.0
python-dotenv>=1.0.0
requests>=2.31.0
```

### main.py (FastAPI)

```python
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import json

from agent import run_agent, run_agent_streaming
from state import AgentState

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["chrome-extension://*", "http://localhost:*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session storage (use Redis in production)
sessions: dict[str, AgentState] = {}

class ChatRequest(BaseModel):
    message: str
    page_content: Optional[str] = None
    page_details: Optional[dict] = None

@app.post("/chat/{session_id}")
async def chat(session_id: str, request: ChatRequest):
    state = sessions.get(session_id, {"messages": []})

    if request.page_content:
        state["page_content"] = request.page_content
    if request.page_details:
        state["page_details"] = request.page_details

    state["messages"].append({"role": "user", "content": request.message})

    result = await run_agent(state)
    sessions[session_id] = result

    response = result["messages"][-1]
    content = response.content if hasattr(response, 'content') else response.get("content", "")
    return {"response": content, "session_id": session_id}

@app.websocket("/ws/{session_id}")
async def websocket_chat(websocket: WebSocket, session_id: str):
    await websocket.accept()

    try:
        while True:
            data = await websocket.receive_text()
            request = json.loads(data)

            state = sessions.get(session_id, {"messages": []})
            state["page_content"] = request.get("page_content", "")
            state["page_details"] = request.get("page_details", {})
            state["messages"].append({"role": "user", "content": request["message"]})

            await websocket.send_json({"type": "status", "status": "thinking"})

            full_response = ""
            async for token in run_agent_streaming(state):
                full_response += token
                await websocket.send_json({"type": "token", "content": token})

            state["messages"].append({"role": "assistant", "content": full_response})
            sessions[session_id] = state

            await websocket.send_json({"type": "done"})

    except WebSocketDisconnect:
        pass

@app.get("/health")
async def health():
    return {"status": "healthy"}
```

### state.py (LangGraph State)

```python
from typing import Annotated, TypedDict, Optional
from langgraph.graph.message import add_messages

class AgentState(TypedDict, total=False):
    messages: Annotated[list, add_messages]
    page_content: str
    page_details: dict
    current_step: str
    error_count: int
    max_steps: int
```

### agent.py (LangGraph Agent)

```python
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state import AgentState
import os

llm = ChatGoogleGenerativeAI(
    model="gemini-1.5-flash",
    google_api_key=os.getenv("GOOGLE_API_KEY"),
)

def create_agent():
    builder = StateGraph(AgentState)
    builder.add_node("process", process_node)
    builder.add_node("respond", respond_node)
    builder.set_entry_point("process")
    builder.add_edge("process", "respond")
    builder.add_edge("respond", END)
    return builder.compile()

def process_node(state: AgentState) -> dict:
    messages = state.get("messages", [])
    page_content = state.get("page_content", "")

    system_msg = "You are a helpful AI assistant."
    if page_content:
        system_msg += f"\n\nCurrent page context:\n{page_content[:3000]}"

    lc_messages = [SystemMessage(content=system_msg)]
    for msg in messages:
        if msg.get("role") == "user":
            lc_messages.append(HumanMessage(content=msg["content"]))
        elif msg.get("role") == "assistant":
            lc_messages.append(AIMessage(content=msg["content"]))

    response = llm.invoke(lc_messages)
    return {"response": response.content}

def respond_node(state: AgentState) -> dict:
    return {"messages": [{"role": "assistant", "content": state.get("response", "")}]}

async def run_agent(state: AgentState) -> AgentState:
    agent = create_agent()
    return await agent.ainvoke(state)

async def run_agent_streaming(state: AgentState):
    agent = create_agent()
    async for event in agent.astream(state, stream_mode="messages"):
        if hasattr(event, 'content') and event.content:
            yield event.content
        elif isinstance(event, tuple) and len(event) > 0:
            msg = event[0]
            if hasattr(msg, 'content') and msg.content:
                yield msg.content
```

---

## Build & Development

### Development Workflow

```bash
# Terminal 1: Build extension with watch
cd extension
npm run dev

# Terminal 2: Run backend
cd backend
source venv/bin/activate
uvicorn main:app --reload --port 8000
```

### Build for Production

```bash
# Build extension
cd extension
npm run build

# Verify dist contents
ls -la dist/
# Must contain: manifest.json, background.js, content.js, sidepanel.html, assets/, icons/
```

### Load Extension

1. Open `chrome://extensions`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `dist/` folder

---

## Critical Build Patterns (Vite)

### 1. Keep Service Worker OUT of Vite Build

```javascript
// WRONG - causes Rollup parse errors
// vite.config.ts
input: {
  background: resolve(__dirname, 'public/background.js'), // DON'T DO THIS
}

// CORRECT - copy in post-build
// package.json
"scripts": {
  "build": "vite build && npm run copy-static",
  "copy-static": "cp -r public/* dist/"
}
```

### 2. File Organization

```
extension/
├── public/                  # Static files (copied to dist root)
│   ├── manifest.json        # MUST be in public/
│   ├── background.js        # MUST be in public/ (plain JS)
│   ├── content.js           # MUST be in public/ (plain JS)
│   └── icons/
├── src/                     # Bundled by Vite
│   └── sidepanel/
├── sidepanel.html           # Entry HTML (in root, not public/)
└── dist/                    # Build output
```

### 3. Post-Build Verification

```bash
# ALWAYS verify after build
ls -la dist/

# Must contain:
# - manifest.json (from public/)
# - background.js (from public/)
# - content.js (from public/)
# - sidepanel.html (built by Vite)
# - assets/ (bundled JS/CSS)
# - icons/ (from public/)
```

### 4. Common Vite Build Errors

| Error | Cause | Solution |
|-------|-------|----------|
| `Parse error @:1:1` | Service worker in Vite input | Keep in public/, copy post-build |
| `manifest.json empty chunks` | manifest.json in Vite input | Keep in public/, copy post-build |
| Side panel not loading | Wrong path in manifest | Verify `sidepanel.html` at dist root |
| Content script not found | Not copied to dist | Add to `copy-static` script |

---

## Reference Documentation

| Topic | Reference File |
|-------|----------------|
| Vite configuration | [references/vite-config.md](references/vite-config.md) |
| FastAPI backend patterns | [references/fastapi-backend.md](references/fastapi-backend.md) |
| LangGraph agent patterns | [references/langgraph-patterns.md](references/langgraph-patterns.md) |
| Extension-backend communication | [references/extension-backend-comm.md](references/extension-backend-comm.md) |
| Lessons learned & troubleshooting | [references/lessons-learned.md](references/lessons-learned.md) |
| Chrome messaging patterns | [references/messaging.md](references/messaging.md) |
| MV3 permissions | [references/mv3-permissions.md](references/mv3-permissions.md) |

---

## Environment Setup

### .env (backend)

```bash
GOOGLE_API_KEY=your-gemini-key
EXA_API_KEY=your-exa-key  # Optional: for web research
```

### .gitignore

```gitignore
# Python
__pycache__/
venv/
.env

# Node/Extension
node_modules/
dist/
.vite/

# IDE
.vscode/
.idea/
```
