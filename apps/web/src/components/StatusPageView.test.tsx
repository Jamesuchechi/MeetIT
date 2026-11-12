import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StatusPageView, SYSTEM_SERVICES } from './StatusPageView';

describe('StatusPageView Component', () => {
  it('renders all system services and edge regions', () => {
    const html = renderToStaticMarkup(<StatusPageView onBackToApp={vi.fn()} />);

    expect(html).toContain('MeetIT Operations');
    expect(html).toContain('All Systems Operational');
    expect(html).toContain('30-day Availability:');
    expect(html).toContain('Signaling Gateway (WebSocket)');
    expect(html).toContain('Media SFU — US East (Virginia)');
    expect(html).toContain('Media SFU — Europe Central (Frankfurt)');
    expect(html).toContain('STUN &amp; CoTURN Global Relay Network');
  });

  it('renders recent incident history', () => {
    const html = renderToStaticMarkup(<StatusPageView />);

    expect(html).toContain('Recent Incidents &amp; Maintenance');
    expect(html).toContain('Elevated Latency on Europe Central Media SFU');
  });
});
