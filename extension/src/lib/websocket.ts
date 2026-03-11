import type { AgentStage, ChatPayload } from '@/lib/types';

export type WsEvent =
  | { type: 'status'; stage: AgentStage }
  | { type: 'token'; content: string }
  | { type: 'done'; meta: { latency_ms: number; tokens: number } }
  | { type: 'error'; message: string };

type MessageHandler = (event: WsEvent) => void;
type ConnectionHandler = (connected: boolean) => void;

export class ChatWebSocket {
  private socket: WebSocket | null = null;
  private connected = false;

  constructor(
    private readonly url: string,
    private readonly onEvent: MessageHandler,
    private readonly onConnectionChange?: ConnectionHandler,
  ) {}

  connect() {
    if (this.socket) {
      this.socket.close();
    }

    this.socket = new WebSocket(this.url);

    this.socket.onopen = () => {
      this.connected = true;
      this.onConnectionChange?.(true);
    };

    this.socket.onclose = () => {
      this.connected = false;
      this.onConnectionChange?.(false);
    };

    this.socket.onerror = () => {
      this.connected = false;
      this.onConnectionChange?.(false);
    };

    this.socket.onmessage = (message) => {
      const payload = JSON.parse(message.data) as WsEvent;
      this.onEvent(payload);
    };
  }

  isConnected() {
    return this.connected && this.socket?.readyState === WebSocket.OPEN;
  }

  send(payload: ChatPayload) {
    if (!this.isConnected() || !this.socket) {
      throw new Error('WebSocket is not connected');
    }
    this.socket.send(JSON.stringify(payload));
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
  }
}
