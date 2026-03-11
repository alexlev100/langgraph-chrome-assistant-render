import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { ChatStageBadge, stageLabel } from '../ChatStageBadge';

describe('ChatStageBadge', () => {
  it('maps backend stages to human labels', () => {
    expect(stageLabel('receiving_context')).toContain('Контекст');
    expect(stageLabel('planning')).toContain('План');
    expect(stageLabel('tooling').toLowerCase()).toContain('инструмент');
  });

  it('renders stage badge', () => {
    render(<ChatStageBadge stage='drafting' />);
    expect(screen.getByText(/Формирую ответ/i)).toBeInTheDocument();
  });
});
