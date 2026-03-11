import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import App from '../App';

const postChatMock = vi.fn();
const clearSessionMock = vi.fn();

vi.mock('@/lib/api', () => ({
  postChat: (...args: unknown[]) => postChatMock(...args),
  clearSession: (...args: unknown[]) => clearSessionMock(...args),
  wsUrlForSession: () => 'ws://localhost/ws/test',
}));

vi.mock('@/lib/logger', () => ({
  createLogger: () => ({ debug: vi.fn(), error: vi.fn() }),
}));

vi.mock('@/lib/websocket', () => ({
  ChatWebSocket: class {
    connect() {}
    disconnect() {}
    isConnected() {
      return false;
    }
    send() {
      throw new Error('not connected');
    }
  },
}));

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    postChatMock.mockReset();
    clearSessionMock.mockReset();

    vi.stubGlobal('chrome', {
      runtime: {
        sendMessage: vi.fn().mockResolvedValue({
          title: 'Example',
          url: 'https://example.com',
          text: 'Example text',
          forms: [],
          selection: '',
        }),
      },
    });
  });

  it('renders assistant markdown from REST fallback', async () => {
    postChatMock.mockResolvedValue({
      response: '## Кратко\n\n**Готово**',
      session_id: 'x',
      meta: {},
    });

    render(<App />);

    const input = screen.getByPlaceholderText(/Спросите о содержимом страницы/i);
    fireEvent.change(input, { target: { value: 'Суммаризируй страницу' } });

    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }));

    await waitFor(() => {
      expect(screen.getByRole('heading', { level: 2, name: 'Кратко' })).toBeInTheDocument();
    });

    expect(screen.getAllByText('Готово').length).toBeGreaterThan(0);
  });

  it('clears local messages and calls clearSession', async () => {
    postChatMock.mockResolvedValue({
      response: 'Готово',
      session_id: 'x',
      meta: {},
    });

    clearSessionMock.mockResolvedValue(undefined);

    render(<App />);

    const input = screen.getByPlaceholderText(/Спросите о содержимом страницы/i);
    fireEvent.change(input, { target: { value: 'Привет' } });
    fireEvent.click(screen.getByRole('button', { name: /Отправить/i }));

    await waitFor(() => {
      expect(screen.getByText('Привет')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Очистить чат/i }));

    await waitFor(() => {
      expect(screen.queryByText('Привет')).toBeNull();
    });

    expect(clearSessionMock).toHaveBeenCalledTimes(1);
  });
});
