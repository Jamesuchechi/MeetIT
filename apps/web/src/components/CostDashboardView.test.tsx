import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CostDashboardView } from './CostDashboardView';

describe('CostDashboardView Component', () => {
  it('renders cost, relay ratio, and carbon telemetry metrics', () => {
    const html = renderToStaticMarkup(<CostDashboardView onToast={vi.fn()} />);

    expect(html).toContain('Cost &amp; Scale Telemetry');
    expect(html).toContain('Estimated Media Cost');
    expect(html).toContain('TURN Relay Ratio');
    expect(html).toContain('1:1 P2P Bypass Savings');
    expect(html).toContain('Carbon Emissions Avoided');
    expect(html).toContain('Interactive Meeting Cost &amp; Relay Simulator');
    expect(html).toContain('Platform Unit Economics');
    expect(html).toContain('Carbon-Aware Regional Routing');
  });
});
