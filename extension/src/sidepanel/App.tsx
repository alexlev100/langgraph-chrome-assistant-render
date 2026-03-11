import { Loader2, Send } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { clearSession, postChat, wsUrlForSession } from '@/lib/api';
import { createLogger } from '@/lib/logger';
import type { AgentStage, ChatMessage, ChatPayload, PageDetails } from '@/lib/types';
import { ChatWebSocket, type WsEvent } from '@/lib/websocket';
import { AgentMarkdown } from '@/sidepanel/AgentMarkdown';

const logger = createLogger('sidepanel');

const EMPTY_CONTEXT: PageDetails = {
  title: '',
  url: '',
  text: '',
  forms: [],
  selection: '',
};

export default function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [stage, setStage] = useState<AgentStage>('done');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pageDetails, setPageDetails] = useState<PageDetails>(EMPTY_CONTEXT);

  const sessionId = useMemo(() => crypto.randomUUID(), []);
  const scrollBottomRef = useRef<HTMLDivElement>(null);
  const activeAssistantMessageIdRef = useRef<string | null>(null);
  const wsRef = useRef<ChatWebSocket | null>(null);

  const onWsEvent = (event: WsEvent) => {
    if (event.type === 'status') {
      setStage(event.stage);
      if (event.stage === 'error') {
        setBusy(false);
      }
      return;
    }

    if (event.type === 'token') {
      appendStreamingToken(event.content);
      return;
    }

    if (event.type === 'done') {
      setStage('done');
      setBusy(false);
      activeAssistantMessageIdRef.current = null;
      return;
    }

    setError(event.message);
    setStage('error');
    setBusy(false);
    activeAssistantMessageIdRef.current = null;
  };

  const appendStreamingToken = (token: string) => {
    const targetId = activeAssistantMessageIdRef.current;
    if (!targetId) {
      return;
    }

    setMessages((prev) =>
      prev.map((message) =>
        message.id === targetId ? { ...message, content: `${message.content}${token}` } : message,
      ),
    );
  };

  useEffect(() => {
    scrollBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, stage]);

  useEffect(() => {
    void refreshPageContext();
  }, []);

  useEffect(() => {
    const ws = new ChatWebSocket(wsUrlForSession(sessionId), onWsEvent);
    ws.connect();
    wsRef.current = ws;

    return () => {
      ws.disconnect();
      wsRef.current = null;
    };
  }, [sessionId]);

  const refreshPageContext = async () => {
    try {
      const response = await chrome.runtime.sendMessage({ type: 'GET_PAGE_CONTEXT' });
      if (response) {
        setPageDetails(response as PageDetails);
      }
    } catch (contextError) {
      logger.error('не удалось получить контекст страницы', contextError);
    }
  };

  const buildPayload = (message: string): ChatPayload => {
    const compactText = (pageDetails.text || '').slice(0, 5000);
    return {
      message,
      page_content: `Заголовок: ${pageDetails.title}\nАдрес: ${pageDetails.url}\n\n${compactText}`,
      page_details: pageDetails,
    };
  };

  const onSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const trimmed = input.trim();
    if (!trimmed || busy) {
      return;
    }

    await refreshPageContext();
    setError(null);
    setBusy(true);

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: Date.now(),
    };

    const assistantMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'assistant',
      content: '',
      timestamp: Date.now(),
    };

    activeAssistantMessageIdRef.current = assistantMessage.id;
    setMessages((prev) => [...prev, userMessage, assistantMessage]);
    setInput('');

    const payload = buildPayload(trimmed);

    try {
      if (wsRef.current?.isConnected()) {
        setStage('receiving_context');
        try {
          wsRef.current.send(payload);
          return;
        } catch (wsError) {
          logger.error('ошибка отправки по websocket, использую REST', wsError);
        }
      }

      const restResult = await postChat(sessionId, payload);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantMessage.id ? { ...message, content: restResult.response } : message,
        ),
      );
      setStage('done');
      setBusy(false);
      activeAssistantMessageIdRef.current = null;
    } catch (submitError) {
      logger.error('запрос в чат завершился с ошибкой', submitError);
      setError(submitError instanceof Error ? submitError.message : 'Неизвестная ошибка');
      setStage('error');
      setBusy(false);
      activeAssistantMessageIdRef.current = null;
    }
  };

  const onClear = async () => {
    setMessages([]);
    setError(null);
    setStage('done');
    activeAssistantMessageIdRef.current = null;
    try {
      await clearSession(sessionId);
    } catch (clearError) {
      logger.error('не удалось очистить серверную сессию', clearError);
    }
  };

  return (
    <div className="flex h-full flex-col p-3">
      <Card className="flex h-full flex-col border-border/70 bg-white/80 backdrop-blur">
        <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="rounded-lg border bg-accent/40 px-3 py-2 text-xs">
            <div className="font-semibold">Текущая страница</div>
            <div className="mt-1 truncate text-muted-foreground">{pageDetails.title || pageDetails.url || 'Контекст страницы недоступен'}</div>
          </div>

          <ScrollArea className="min-h-0 flex-1 pr-2">
            <div className="space-y-3">
              {messages.length === 0 ? (
                <Card className="border-dashed bg-muted/40">
                  <CardContent className="pt-4 text-sm text-muted-foreground">
                    Спросите: <strong>"Суммаризируй эту страницу"</strong> или <strong>"Объясни этот раздел"</strong>.
                  </CardContent>
                </Card>
              ) : null}

              {messages.map((message) => (
                <div key={message.id} className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[92%] rounded-xl border px-3 py-2 text-sm ${
                      message.role === 'user'
                        ? 'border-primary/30 bg-primary text-primary-foreground shadow-glow'
                        : 'border-border bg-card text-card-foreground'
                    }`}
                  >
                    {message.role === 'assistant' ? (
                      message.content ? (
                        <AgentMarkdown content={message.content} />
                      ) : (
                        <div className="space-y-2">
                          <Skeleton className="h-3 w-40" />
                          <Skeleton className="h-3 w-32" />
                        </div>
                      )
                    ) : (
                      <p className="whitespace-pre-wrap leading-relaxed">{message.content}</p>
                    )}
                  </div>
                </div>
              ))}

              {busy && stage !== 'streaming' ? (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Обработка...
                </div>
              ) : null}

              <div ref={scrollBottomRef} />
            </div>
          </ScrollArea>

          {error ? <div className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive">{error}</div> : null}

          <form onSubmit={onSubmit} className="space-y-2">
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Спросите о содержимом страницы..."
              className="min-h-[78px] bg-white"
              disabled={busy}
            />
            <div className="flex items-center justify-between">
              <Button type="button" variant="ghost" onClick={onClear} aria-label="Очистить чат">
                Очистить чат
              </Button>
              <Button type="submit" disabled={busy || !input.trim()}>
                <Send className="mr-2 h-4 w-4" />
                Отправить
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
