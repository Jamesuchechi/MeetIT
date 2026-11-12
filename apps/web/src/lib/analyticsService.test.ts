import { describe, expect, it } from 'vitest';
import {
  computeMeetingAnalytics,
  filterHistoryByTimeRange,
  calculateMeetingEfficiencyScore,
  exportAnalyticsToCsv,
  exportAnalyticsToJson,
} from './analyticsService';
import type { MeetingHistoryItem } from './meetingsStore';

describe('analyticsService', () => {
  const baseTime = new Date('2026-11-12T12:00:00Z').getTime();

  const mockHistory: MeetingHistoryItem[] = [
    {
      id: 'm-1',
      roomCode: 'abc-defg-hij',
      roomTitle: '1:1 Sync with Bob',
      startedAt: new Date(baseTime - 2 * 24 * 60 * 60 * 1000).toISOString(),
      endedAt: new Date(
        baseTime - 2 * 24 * 60 * 60 * 1000 + 30 * 60000,
      ).toISOString(),
      durationMinutes: 30,
      peakParticipants: 2,
      attendees: [],
    },
    {
      id: 'm-2',
      roomCode: 'xyz-uvwx-rst',
      roomTitle: 'Weekly Team Standup',
      startedAt: new Date(baseTime - 4 * 24 * 60 * 60 * 1000).toISOString(),
      endedAt: new Date(
        baseTime - 4 * 24 * 60 * 60 * 1000 + 20 * 60000,
      ).toISOString(),
      durationMinutes: 20,
      peakParticipants: 5,
      attendees: [],
    },
    {
      id: 'm-3',
      roomCode: 'qrs-tuvw-xyz',
      roomTitle: 'All Hands / Company Review',
      startedAt: new Date(baseTime - 20 * 24 * 60 * 60 * 1000).toISOString(), // 20 days ago (outside 7d week)
      endedAt: new Date(
        baseTime - 20 * 24 * 60 * 60 * 1000 + 60 * 60000,
      ).toISOString(),
      durationMinutes: 60,
      peakParticipants: 18,
      attendees: [],
    },
  ];

  it('filters history records by time window accurately', () => {
    const week = filterHistoryByTimeRange(mockHistory, 'week', baseTime);
    expect(week.length).toBe(2);

    const month = filterHistoryByTimeRange(mockHistory, 'month', baseTime);
    expect(month.length).toBe(3);
  });

  it('calculates efficiency score with penalties for oversized meetings', () => {
    const scoreHealthy = calculateMeetingEfficiencyScore([
      mockHistory[0]!,
      mockHistory[1]!,
    ]);
    expect(scoreHealthy).toBeGreaterThanOrEqual(90);

    const scoreOversized = calculateMeetingEfficiencyScore([mockHistory[2]!]);
    expect(scoreOversized).toBeLessThan(80);
  });

  it('computes full analytics summary including focus time and breakdown', () => {
    const summary = computeMeetingAnalytics(mockHistory, 'week', baseTime);

    expect(summary.totalMeetings).toBe(2);
    expect(summary.totalMinutes).toBe(50);
    expect(summary.totalHours).toBeCloseTo(0.8, 1);
    expect(summary.averageMinutes).toBe(25);
    expect(summary.focusTimeRatioPct).toBeGreaterThan(90);
    expect(summary.typeBreakdown.oneOnOne).toBe(1);
    expect(summary.typeBreakdown.smallGroup).toBe(1);
    expect(summary.dayOfWeekDistribution.length).toBe(7);
    expect(summary.recommendations.length).toBeGreaterThan(0);
  });

  it('exports analytics to CSV and JSON formats', () => {
    const summary = computeMeetingAnalytics(mockHistory, 'month', baseTime);

    const csv = exportAnalyticsToCsv(summary);
    expect(csv).toContain('Metric,Value');
    expect(csv).toContain('Total Meetings,3');
    expect(csv).toContain('Day,Meeting Count,Meeting Minutes');

    const json = exportAnalyticsToJson(summary);
    expect(json).toContain('"totalMeetings": 3');
  });
});
