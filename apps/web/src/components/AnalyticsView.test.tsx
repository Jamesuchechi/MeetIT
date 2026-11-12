import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnalyticsView } from './AnalyticsView';
import type { MeetingHistoryItem } from '../lib/meetingsStore';

describe('AnalyticsView Component', () => {
  const sampleHistory: MeetingHistoryItem[] = [
    {
      id: 'm-1',
      roomCode: 'abc-defg-hij',
      roomTitle: 'Architecture Review',
      startedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      endedAt: new Date(
        Date.now() - 24 * 60 * 60 * 1000 + 45 * 60000,
      ).toISOString(),
      durationMinutes: 45,
      peakParticipants: 4,
      attendees: [],
    },
  ];

  it('renders analytics KPI cards, charts, and recommendations', () => {
    const html = renderToStaticMarkup(
      <AnalyticsView initialHistory={sampleHistory} onToast={vi.fn()} />,
    );

    expect(html).toContain('Meeting Analytics &amp; Insights');
    expect(html).toContain('Total Meeting Time');
    expect(html).toContain('Focus Time Ratio');
    expect(html).toContain('Meeting Health Score');
    expect(html).toContain('Meeting Hours by Day of Week');
    expect(html).toContain('Meeting Size Breakdown');
    expect(html).toContain('In-Call Feature Engagement');
    expect(html).toContain('Productivity Recommendations');
    expect(html).toContain('Privacy Guarantee:');
  });
});
