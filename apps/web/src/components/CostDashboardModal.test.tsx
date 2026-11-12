import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CostDashboardModal } from './CostDashboardModal';

describe('CostDashboardModal Component', () => {
  it('renders cost, relay ratio, and carbon telemetry metrics', () => {
    const handleClose = vi.fn();
    const html = renderToStaticMarkup(
      <CostDashboardModal
        isOpen={true}
        onClose={handleClose}
        durationSeconds={1200}
        participantCount={4}
        bytesReceived={100 * 1024 * 1024}
        bytesSent={100 * 1024 * 1024}
        relayBytes={10 * 1024 * 1024}
        currentRegionId="us-west"
      />,
    );

    expect(html).toContain('Cost, Scale &amp; Carbon Telemetry');
    expect(html).toContain('TURN Relay Ratio');
    expect(html).toContain('Carbon Footprint');
    expect(html).toContain('Green Meeting Impact');
    expect(html).toContain('us-west');
  });

  it('renders 1:1 P2P Direct Bypass indicator when 2 participants are connected', () => {
    const html = renderToStaticMarkup(
      <CostDashboardModal
        isOpen={true}
        onClose={vi.fn()}
        durationSeconds={600}
        participantCount={2}
        bytesReceived={50 * 1024 * 1024}
        bytesSent={50 * 1024 * 1024}
        isP2PDirectActive={true}
      />,
    );

    expect(html).toContain('1:1 P2P Direct Bypass Active');
    expect(html).toContain('Estimated savings:');
  });

  it('does not render when isOpen is false', () => {
    const html = renderToStaticMarkup(
      <CostDashboardModal
        isOpen={false}
        onClose={vi.fn()}
        durationSeconds={0}
        participantCount={0}
        bytesReceived={0}
        bytesSent={0}
      />,
    );

    expect(html).toBe('');
  });
});
