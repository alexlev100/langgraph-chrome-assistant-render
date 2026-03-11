import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';

import { AgentMarkdown } from '../AgentMarkdown';

describe('AgentMarkdown', () => {
  it('renders markdown headings and bold text', () => {
    render(<AgentMarkdown content={'## Title\n\n**bold** text'} />);

    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeInTheDocument();
    expect(screen.getByText('bold')).toBeInTheDocument();
  });

  it('sanitizes script tags from assistant output', () => {
    render(<AgentMarkdown content={'Hello<script>alert(1)</script>World'} />);

    expect(screen.queryByText(/alert\(1\)/)).toBeNull();
    expect(screen.getByText(/Hello/)).toBeInTheDocument();
    expect(screen.getByText(/World/)).toBeInTheDocument();
  });
});
