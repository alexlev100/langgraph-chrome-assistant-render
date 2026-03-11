import type { ChatPayload } from '@/lib/types';

const baseUrl = import.meta.env.VITE_BACKEND_BASE_URL || 'http://localhost:8000';

export interface RestChatResponse {
  response: string;
  session_id: string;
  meta: Record<string, unknown>;
}

export async function postChat(sessionId: string, payload: ChatPayload): Promise<RestChatResponse> {
  const response = await fetch(`${baseUrl}/chat/${sessionId}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }

  return response.json() as Promise<RestChatResponse>;
}

export async function clearSession(sessionId: string): Promise<void> {
  await fetch(`${baseUrl}/session/${sessionId}`, { method: 'DELETE' });
}

export function wsUrlForSession(sessionId: string): string {
  const wsBase = baseUrl.replace(/^http/, 'ws');
  return `${wsBase}/ws/${sessionId}`;
}
