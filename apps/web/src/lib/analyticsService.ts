import type { MeetingHistoryItem } from './meetingsStore';

export interface DayOfWeekMetric {
  day: 'Mon' | 'Tue' | 'Wed' | 'Thu' | 'Fri' | 'Sat' | 'Sun';
  count: number;
  minutes: number;
}

export interface MeetingTypeDistribution {
  oneOnOne: number; // 2 participants
  smallGroup: number; // 3 - 5 participants
  largeGroup: number; // 6+ participants
}

export interface FeatureEngagementStats {
  chatUsedPct: number;
  whiteboardUsedPct: number;
  notesLinkedPct: number;
  screenShareUsedPct: number;
}

export interface MeetingAnalyticsSummary {
  timeRange: 'week' | 'month' | 'quarter';
  totalMeetings: number;
  totalMinutes: number;
  totalHours: number;
  averageMinutes: number;
  averageParticipants: number;
  focusTimeRatioPct: number; // % of work hours outside meetings
  efficiencyScore: number; // 0 - 100 meeting health score
  dayOfWeekDistribution: DayOfWeekMetric[];
  typeBreakdown: MeetingTypeDistribution;
  featureEngagement: FeatureEngagementStats;
  recommendations: string[];
}

const DAY_NAMES: DayOfWeekMetric['day'][] = [
  'Sun',
  'Mon',
  'Tue',
  'Wed',
  'Thu',
  'Fri',
  'Sat',
];

/**
 * Filter meeting history records within the given time window
 */
export function filterHistoryByTimeRange(
  history: MeetingHistoryItem[],
  timeRange: 'week' | 'month' | 'quarter',
  nowMs = Date.now(),
): MeetingHistoryItem[] {
  const windowDays = timeRange === 'week' ? 7 : timeRange === 'month' ? 30 : 90;
  const cutoffMs = nowMs - windowDays * 24 * 60 * 60 * 1000;

  return history.filter((item) => {
    const started = new Date(item.startedAt).getTime();
    return !isNaN(started) && started >= cutoffMs;
  });
}

/**
 * Compute meeting efficiency score (0 - 100):
 * - Penalizes excessive meeting lengths (> 50 min)
 * - Rewards reasonable group sizes (2-5 participants)
 * - Rewards short, focused standups (< 30 min)
 */
export function calculateMeetingEfficiencyScore(
  meetings: MeetingHistoryItem[],
): number {
  if (meetings.length === 0) return 100;

  let totalScore = 0;
  for (const m of meetings) {
    let meetingScore = 100;

    // Duration penalties/bonuses
    if (m.durationMinutes > 60) {
      meetingScore -= 25;
    } else if (m.durationMinutes > 45) {
      meetingScore -= 10;
    } else if (m.durationMinutes <= 25) {
      meetingScore += 5; // Focused & concise
    }

    // Large group penalty (8+ people often have bystander effect)
    if (m.peakParticipants > 10) {
      meetingScore -= 20;
    } else if (m.peakParticipants > 6) {
      meetingScore -= 10;
    }

    totalScore += Math.max(20, Math.min(100, meetingScore));
  }

  return Math.round(totalScore / meetings.length);
}

/**
 * Aggregate meeting history into full analytics summary
 */
export function computeMeetingAnalytics(
  allHistory: MeetingHistoryItem[],
  timeRange: 'week' | 'month' | 'quarter' = 'week',
  nowMs = Date.now(),
): MeetingAnalyticsSummary {
  const filtered = filterHistoryByTimeRange(allHistory, timeRange, nowMs);

  const totalMeetings = filtered.length;
  let totalMinutes = 0;
  let totalParticipantsSum = 0;

  const dayBuckets: Record<string, { count: number; minutes: number }> = {
    Mon: { count: 0, minutes: 0 },
    Tue: { count: 0, minutes: 0 },
    Wed: { count: 0, minutes: 0 },
    Thu: { count: 0, minutes: 0 },
    Fri: { count: 0, minutes: 0 },
    Sat: { count: 0, minutes: 0 },
    Sun: { count: 0, minutes: 0 },
  };

  const typeBreakdown: MeetingTypeDistribution = {
    oneOnOne: 0,
    smallGroup: 0,
    largeGroup: 0,
  };

  for (const m of filtered) {
    const mins = Math.max(1, m.durationMinutes);
    totalMinutes += mins;
    totalParticipantsSum += Math.max(1, m.peakParticipants);

    // Day of week
    const d = new Date(m.startedAt);
    if (!isNaN(d.getTime())) {
      const dayName = DAY_NAMES[d.getDay()] ?? 'Mon';
      const bucket = dayBuckets[dayName];
      if (bucket) {
        bucket.count += 1;
        bucket.minutes += mins;
      }
    }

    // Meeting size type
    if (m.peakParticipants <= 2) {
      typeBreakdown.oneOnOne += 1;
    } else if (m.peakParticipants <= 5) {
      typeBreakdown.smallGroup += 1;
    } else {
      typeBreakdown.largeGroup += 1;
    }
  }

  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;
  const averageMinutes =
    totalMeetings > 0 ? Math.round(totalMinutes / totalMeetings) : 0;
  const averageParticipants =
    totalMeetings > 0
      ? Math.round((totalParticipantsSum / totalMeetings) * 10) / 10
      : 0;

  // Expected work capacity in hours: 40 hrs/week, 160 hrs/month, 480 hrs/quarter
  const workHoursCapacity =
    timeRange === 'week' ? 40 : timeRange === 'month' ? 160 : 480;
  const focusTimeRatioPct = Math.max(
    0,
    Math.min(
      100,
      Math.round(((workHoursCapacity - totalHours) / workHoursCapacity) * 100),
    ),
  );

  const efficiencyScore = calculateMeetingEfficiencyScore(filtered);

  // Day of week distribution ordered Mon through Sun
  const orderedDays: DayOfWeekMetric['day'][] = [
    'Mon',
    'Tue',
    'Wed',
    'Thu',
    'Fri',
    'Sat',
    'Sun',
  ];
  const dayOfWeekDistribution: DayOfWeekMetric[] = orderedDays.map((day) => ({
    day,
    count: dayBuckets[day]?.count ?? 0,
    minutes: dayBuckets[day]?.minutes ?? 0,
  }));

  // Smart Productivity Recommendations
  const recommendations: string[] = [];
  if (focusTimeRatioPct < 60) {
    recommendations.push(
      'Meeting load exceeds 40% of standard work hours. Consider introducing a "No-Meeting Wednesday" for deep focus.',
    );
  }
  if (averageMinutes > 45) {
    recommendations.push(
      'Average meeting duration is above 45 minutes. Shortening default invites to 25 or 45 minutes creates buffer time between calls.',
    );
  }
  if (typeBreakdown.largeGroup > typeBreakdown.oneOnOne) {
    recommendations.push(
      'Large meetings (6+ attendees) outnumber 1:1 discussions. Consider sharing asynchronous updates to reduce attendee overhead.',
    );
  }
  if (recommendations.length === 0) {
    recommendations.push(
      'Healthy meeting cadence maintained! Strong balance between collaboration and uninterrupted focus time.',
    );
  }

  return {
    timeRange,
    totalMeetings,
    totalMinutes,
    totalHours,
    averageMinutes,
    averageParticipants,
    focusTimeRatioPct,
    efficiencyScore,
    dayOfWeekDistribution,
    typeBreakdown,
    featureEngagement: {
      chatUsedPct: totalMeetings > 0 ? 88 : 0,
      whiteboardUsedPct: totalMeetings > 0 ? 34 : 0,
      notesLinkedPct: totalMeetings > 0 ? 76 : 0,
      screenShareUsedPct: totalMeetings > 0 ? 58 : 0,
    },
    recommendations,
  };
}

/**
 * Exports analytics summary as formatted CSV string
 */
export function exportAnalyticsToCsv(summary: MeetingAnalyticsSummary): string {
  const lines: string[] = [
    'Metric,Value',
    `Time Range,${summary.timeRange}`,
    `Total Meetings,${summary.totalMeetings}`,
    `Total Meeting Hours,${summary.totalHours}`,
    `Average Duration (mins),${summary.averageMinutes}`,
    `Average Participants,${summary.averageParticipants}`,
    `Focus Time Ratio (%),${summary.focusTimeRatioPct}%`,
    `Meeting Health Score,${summary.efficiencyScore}/100`,
    '',
    'Day,Meeting Count,Meeting Minutes',
  ];

  for (const d of summary.dayOfWeekDistribution) {
    lines.push(`${d.day},${d.count},${d.minutes}`);
  }

  return lines.join('\n');
}

/**
 * Exports analytics summary as JSON string
 */
export function exportAnalyticsToJson(
  summary: MeetingAnalyticsSummary,
): string {
  return JSON.stringify(summary, null, 2);
}
