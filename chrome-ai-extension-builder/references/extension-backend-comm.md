# Extension-Backend Communication Reference

Patterns for connecting Chrome extensions to Python backends.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Page Context Pipeline](#page-context-pipeline)
- [WebSocket Client](#websocket-client)
- [REST API Client](#rest-api-client)
- [Dual Communication Pattern](#dual-communication-pattern)
- [Error Handling](#error-handling)
- [Request/Response Contracts](#requestresponse-contracts)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Chrome Extension                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────┐    │
│  │Content Script│────→│  Background  │←───→│  Side Panel  │    │
│  │  (per tab)   │     │  (singleton) │     │   (React)    │    │
│  └──────────────┘     └──────────────┘     └──────────────┘    │
│         │                    │                    │             │
│    Extract DOM          Route msgs          WebSocket +         │
│    + forms              + fallback          REST client         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               │ HTTP / WebSocket
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                     FastAPI Backend                              │
├─────────────────────────────────────────────────────────────────┤
│  POST /chat/{session_id}     WS /ws/{session_id}                │
│           │                           │                          │
│           └───────────┬───────────────┘                          │
│                       ▼                                          │
│              ┌────────────────┐                                  │
│              │ LangGraph Agent│                                  │
│              └────────────────┘                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Page Context Pipeline

### Step 1: Content Script Extraction

```typescript
// entrypoints/content.ts
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',

  main(ctx) {
    // Listen for extraction requests
    browser.runtime.onMessage.addListener((msg, _, sendResponse) => {
      if (msg.type === 'EXTRACT_PAGE') {
        sendResponse(extractFullContext());
      }
      return false;
    });
  },
});

interface PageContext {
  title: string;
  url: string;
  text: string;
  forms: FormData[];
}

function extractFullContext(): PageContext {
  return {
    title: document.title,
    url: window.location.href,
    text: document.body.innerText.slice(0, 5000), // Limit size
    forms: extractForms(),
  };
}

function extractForms(): FormData[] {
  return Array.from(document.forms).slice(0, 5).map((form, i) => ({
    id: form.id || `form_${i}`,
    action: form.action,
    method: form.method,
    fields: Array.from(form.elements)
      .filter((el): el is HTMLInputElement =>
        el instanceof HTMLInputElement ||
        el instanceof HTMLTextAreaElement ||
        el instanceof HTMLSelectElement
      )
      .slice(0, 20)
      .map(el => ({
        name: el.name,
        type: el.type,
        label: findLabel(el),
        required: el.required,
        value: el.value?.slice(0, 100),
      })),
  }));
}

function findLabel(element: HTMLElement): string {
  // Try explicit label
  const id = element.id;
  if (id) {
    const label = document.querySelector(`label[for="${id}"]`);
    if (label) return label.textContent?.trim() || '';
  }

  // Try parent label
  const parentLabel = element.closest('label');
  if (parentLabel) return parentLabel.textContent?.trim() || '';

  // Try aria-label
  return element.getAttribute('aria-label') || '';
}
```

### Step 2: Background Routing with Fallback

```typescript
// entrypoints/background.ts
export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'GET_PAGE_CONTEXT') {
      handleGetPageContext(sender.tab?.id).then(sendResponse);
      return true; // Async response
    }
  });
});

async function handleGetPageContext(tabId?: number): Promise<PageContext> {
  // Validate tab
  if (!tabId) {
    return emptyContext();
  }

  // Check if tab URL is accessible
  const tab = await browser.tabs.get(tabId);
  if (!tab.url || !tab.url.startsWith('http')) {
    // Can't inject into chrome://, about:, etc.
    return { title: tab.title || '', url: tab.url || '', text: '', forms: [] };
  }

  try {
    // Try content script first
    const response = await browser.tabs.sendMessage(tabId, { type: 'EXTRACT_PAGE' });
    return response;
  } catch (error) {
    // Content script not loaded - use fallback
    console.log('[Background] Content script unavailable, using fallback');
    return await fallbackExtraction(tabId);
  }
}

async function fallbackExtraction(tabId: number): Promise<PageContext> {
  try {
    const [result] = await browser.scripting.executeScript({
      target: { tabId },
      func: () => ({
        title: document.title,
        url: window.location.href,
        text: document.body.innerText.slice(0, 5000),
        forms: [], // Simplified fallback
      }),
    });
    return result.result;
  } catch {
    // Even fallback failed (restricted page)
    return emptyContext();
  }
}

function emptyContext(): PageContext {
  return { title: '', url: '', text: '', forms: [] };
}
```

### Step 3: Frontend Formatting

```typescript
// lib/api.ts
export function formatPageContext(ctx: PageContext): {
  page_content: string;
  page_details: PageContext;
} {
  // Human-readable summary for logging/display
  const page_content = `
Page: ${ctx.title}
URL: ${ctx.url}

${ctx.text.slice(0, 3000)}

${ctx.forms.length > 0 ? `Forms:\n${formatForms(ctx.forms)}` : ''}
  `.trim();

  return {
    page_content,
    page_details: ctx, // Structured data for tools
  };
}

function formatForms(forms: FormData[]): string {
  return forms.map(f =>
    `- ${f.id}: ${f.fields.map(field => field.name).join(', ')}`
  ).join('\n');
}
```

---

## WebSocket Client

### Connection Manager

```typescript
// lib/websocket.ts
type MessageHandler = (data: any) => void;
type StatusHandler = (status: 'connecting' | 'connected' | 'disconnected' | 'error') => void;

export class WebSocketManager {
  private ws: WebSocket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private messageHandlers: MessageHandler[] = [];
  private statusHandlers: StatusHandler[] = [];

  constructor(private url: string) {}

  connect(): void {
    this.notifyStatus('connecting');

    this.ws = new WebSocket(this.url);

    this.ws.onopen = () => {
      this.reconnectAttempts = 0;
      this.notifyStatus('connected');
    };

    this.ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      this.messageHandlers.forEach(handler => handler(data));
    };

    this.ws.onclose = () => {
      this.notifyStatus('disconnected');
      this.attemptReconnect();
    };

    this.ws.onerror = () => {
      this.notifyStatus('error');
    };
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    setTimeout(() => this.connect(), delay);
  }

  send(data: object): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
      return true;
    }
    return false;
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler);
    return () => {
      this.messageHandlers = this.messageHandlers.filter(h => h !== handler);
    };
  }

  onStatus(handler: StatusHandler): () => void {
    this.statusHandlers.push(handler);
    return () => {
      this.statusHandlers = this.statusHandlers.filter(h => h !== handler);
    };
  }

  private notifyStatus(status: 'connecting' | 'connected' | 'disconnected' | 'error'): void {
    this.statusHandlers.forEach(handler => handler(status));
  }

  disconnect(): void {
    this.ws?.close();
    this.ws = null;
  }

  get isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }
}
```

### React Hook

```typescript
// hooks/useWebSocket.ts
import { useEffect, useRef, useState, useCallback } from 'react';
import { WebSocketManager } from '../lib/websocket';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocketManager | null>(null);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'disconnected' | 'error'>('disconnected');

  useEffect(() => {
    const ws = new WebSocketManager(url);
    wsRef.current = ws;

    ws.onStatus(setStatus);
    ws.connect();

    return () => ws.disconnect();
  }, [url]);

  const send = useCallback((data: object): boolean => {
    return wsRef.current?.send(data) ?? false;
  }, []);

  const onMessage = useCallback((handler: (data: any) => void) => {
    return wsRef.current?.onMessage(handler) ?? (() => {});
  }, []);

  return { send, onMessage, status, isConnected: status === 'connected' };
}
```

---

## REST API Client

### API Client Class

```typescript
// lib/api.ts
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export interface ChatRequest {
  message: string;
  page_content?: string;
  page_details?: object;
}

export interface ChatResponse {
  response: string;
  session_id: string;
  tool_calls?: object[];
}

class APIClient {
  private baseUrl: string;

  constructor(baseUrl: string = API_URL) {
    this.baseUrl = baseUrl;
  }

  async chat(sessionId: string, request: ChatRequest): Promise<ChatResponse> {
    const response = await fetch(`${this.baseUrl}/chat/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new APIError(error.code || 'request_failed', error.message);
    }

    return response.json();
  }

  async updateContext(sessionId: string, context: PageContext): Promise<void> {
    await fetch(`${this.baseUrl}/context/${sessionId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(context),
    });
  }

  async clearSession(sessionId: string): Promise<void> {
    await fetch(`${this.baseUrl}/session/${sessionId}`, {
      method: 'DELETE',
    });
  }

  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const api = new APIClient();

export class APIError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'APIError';
  }
}
```

---

## Dual Communication Pattern

### Combined WebSocket + REST

```typescript
// hooks/useChat.ts
import { useState, useEffect, useCallback, useRef } from 'react';
import { useWebSocket } from './useWebSocket';
import { api, formatPageContext } from '../lib/api';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

export function useChat(sessionId: string) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const wsUrl = `ws://localhost:8000/ws/${sessionId}`;
  const { send: wsSend, onMessage, isConnected } = useWebSocket(wsUrl);

  // Handle WebSocket messages
  useEffect(() => {
    return onMessage((data) => {
      if (data.type === 'token') {
        setMessages(prev => updateLastAssistant(prev, data.content));
      } else if (data.type === 'done') {
        setLoading(false);
      } else if (data.type === 'error') {
        setError(data.message);
        setLoading(false);
      }
    });
  }, [onMessage]);

  const sendMessage = useCallback(async (content: string, pageContext?: PageContext) => {
    if (!content.trim() || loading) return;

    setError(null);
    setLoading(true);

    // Add user message and placeholder for assistant
    setMessages(prev => [
      ...prev,
      { role: 'user', content },
      { role: 'assistant', content: '' },
    ]);

    const { page_content, page_details } = pageContext
      ? formatPageContext(pageContext)
      : { page_content: '', page_details: {} };

    // Try WebSocket first
    if (isConnected) {
      const sent = wsSend({
        message: content,
        page_content,
        page_details,
      });

      if (sent) return; // WebSocket will handle response
    }

    // Fall back to REST
    try {
      const response = await api.chat(sessionId, {
        message: content,
        page_content,
        page_details,
      });

      setMessages(prev => updateLastAssistant(prev, response.response));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }, [sessionId, loading, isConnected, wsSend]);

  return { messages, loading, error, sendMessage, isConnected };
}

function updateLastAssistant(messages: Message[], content: string): Message[] {
  const updated = [...messages];
  const lastIdx = updated.length - 1;
  if (lastIdx >= 0 && updated[lastIdx].role === 'assistant') {
    updated[lastIdx] = {
      ...updated[lastIdx],
      content: updated[lastIdx].content + content,
    };
  }
  return updated;
}
```

---

## Error Handling

### Extension Side

```typescript
// lib/errors.ts
export class ExtensionError extends Error {
  constructor(
    public code: string,
    message: string,
    public recoverable: boolean = true
  ) {
    super(message);
    this.name = 'ExtensionError';
  }
}

export function handleAPIError(error: unknown): ExtensionError {
  if (error instanceof APIError) {
    return new ExtensionError(error.code, error.message);
  }

  if (error instanceof TypeError && error.message.includes('fetch')) {
    return new ExtensionError(
      'network_error',
      'Cannot connect to server. Is the backend running?',
      true
    );
  }

  return new ExtensionError(
    'unknown_error',
    error instanceof Error ? error.message : 'An unknown error occurred'
  );
}
```

### Retry Logic

```typescript
// lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    delay?: number;
    backoff?: boolean;
  } = {}
): Promise<T> {
  const { maxAttempts = 3, delay = 1000, backoff = true } = options;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt === maxAttempts) throw error;

      const waitTime = backoff ? delay * Math.pow(2, attempt - 1) : delay;
      await new Promise(resolve => setTimeout(resolve, waitTime));
    }
  }

  throw new Error('Unreachable');
}

// Usage
const response = await withRetry(
  () => api.chat(sessionId, request),
  { maxAttempts: 3, delay: 1000, backoff: true }
);
```

---

## Request/Response Contracts

### Chat Endpoint Contract

```typescript
// POST /chat/{session_id}
interface ChatRequest {
  message: string;
  page_content?: string;  // Flattened summary for logging
  page_details?: {        // Structured data for tools
    title: string;
    url: string;
    text: string;
    forms?: {
      id: string;
      action: string;
      method: string;
      fields: {
        name: string;
        label: string;
        type: string;
        required: boolean;
        value: string;
      }[];
    }[];
  };
}

interface ChatResponse {
  response: string;
  session_id: string;
  tool_calls?: {
    name: string;
    args: Record<string, any>;
    result?: any;
  }[];
}
```

### WebSocket Message Contract

```typescript
// Client → Server
interface WSClientMessage {
  message: string;
  page_content?: string;
  page_details?: object;
}

// Server → Client
type WSServerMessage =
  | { type: 'status'; status: 'thinking' | 'using_tool' }
  | { type: 'token'; content: string }
  | { type: 'tool_call'; name: string; args: object }
  | { type: 'tool_result'; name: string; result: any }
  | { type: 'done' }
  | { type: 'error'; message: string; code?: string };
```
