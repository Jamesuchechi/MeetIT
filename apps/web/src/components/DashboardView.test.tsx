import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { DashboardView } from './DashboardView';
import type { AuthUser } from '../types';

describe('DashboardView Component & Cost Tab', () => {
  const mockUser: AuthUser = {
    id: 'usr_test_123',
    email: 'test@meetit.live',
    displayName: 'Test User',
  };

  it('renders sidebar with Cost & Scale navigation button', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        user={mockUser}
        initialTab="home"
        onEnterRoom={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    expect(html).toContain('data-testid="sidebar-cost-btn"');
    expect(html).toContain('Cost &amp; Scale');
  });

  it('renders Cost & Scale Telemetry view when activeTab is cost', () => {
    const html = renderToStaticMarkup(
      <DashboardView
        user={mockUser}
        initialTab="cost"
        onEnterRoom={vi.fn()}
        onToast={vi.fn()}
      />,
    );

    expect(html).toContain('Cost &amp; Scale Telemetry');
    expect(html).toContain('Estimated Media Cost');
    expect(html).toContain('Interactive Meeting Cost &amp; Relay Simulator');
  });
});
