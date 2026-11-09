import { describe, it, expect, vi } from 'vitest';
import {
  buildSlackSlashResponse,
  buildTeamsAdaptiveCard,
  buildSlackSummaryCard,
  pushActionItemsToLinear,
  formatHubSpotCallEngagement,
  formatSalesforceActivity,
} from './workplaceIntegrations';

describe('Workplace & Productivity Integrations', () => {
  it('builds Slack Block Kit response for /meetit slash command', () => {
    const slackResp = buildSlackSlashResponse({
      code: 'gzh-kfwu-wqt',
      title: 'Design Critique',
      hostName: 'Ada Lovelace',
      roomUrl: 'https://meetit.app/m/gzh-kfwu-wqt',
    });

    expect(slackResp.response_type).toBe('in_channel');
    expect(slackResp.blocks).toBeDefined();

    const textBlock = slackResp.blocks[0] as any;
    expect(textBlock.text.text).toContain('Design Critique');
    expect(textBlock.text.text).toContain('Ada Lovelace');

    const actionsBlock = slackResp.blocks[2] as any;
    expect(actionsBlock.elements[0].url).toBe(
      'https://meetit.app/m/gzh-kfwu-wqt',
    );
  });

  it('builds Microsoft Teams Adaptive Card', () => {
    const card = buildTeamsAdaptiveCard({
      code: 'gzh-kfwu-wqt',
      title: 'All-Hands Sync',
      hostName: 'Grace Hopper',
      roomUrl: 'https://meetit.app/m/gzh-kfwu-wqt',
    });

    expect(card.type).toBe('AdaptiveCard');
    expect(card.body[0]?.text).toBe('All-Hands Sync');
    expect(card.actions[0]?.url).toBe('https://meetit.app/m/gzh-kfwu-wqt');
  });

  it('builds Slack meeting summary with action items and recording link', () => {
    const summary = buildSlackSummaryCard({
      roomCode: 'gzh-kfwu-wqt',
      roomTitle: 'Sprint 42 Retrospective',
      hostName: 'Ada',
      durationMinutes: 52,
      attendeesCount: 8,
      actionItems: [
        {
          id: '1',
          title: 'Audit webRTC turn credentials',
          assignee: 'alan',
          dueDate: 'Nov 18',
        },
        {
          id: '2',
          title: 'Benchmark background blur on low-end Android',
          priority: 'high',
        },
      ],
      recordingUrl: 'https://cdn.meetit.app/recordings/gzh.mp4',
    });

    const blocksStr = JSON.stringify(summary.blocks);
    expect(blocksStr).toContain('Audit webRTC turn credentials');
    expect(blocksStr).toContain('@alan');
    expect(blocksStr).toContain('Benchmark background blur on low-end Android');
    expect(blocksStr).toContain('https://cdn.meetit.app/recordings/gzh.mp4');
  });

  it('pushes action items to Linear using GraphQL mutations', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: { issueCreate: { success: true } } }),
    });

    const res = await pushActionItemsToLinear(
      'lin_api_test_key',
      'team_eng_123',
      [
        { id: 'item-1', title: 'Implement rate limiting in API gateway' },
        { id: 'item-2', title: 'Add dark mode to iframe embed' },
      ],
      mockFetch as unknown as typeof fetch,
    );

    expect(res.success).toBe(true);
    expect(res.createdCount).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(2);

    const firstCallInit = mockFetch.mock.calls[0]![1] as RequestInit;
    expect(firstCallInit.headers).toHaveProperty(
      'Authorization',
      'lin_api_test_key',
    );
    expect(String(firstCallInit.body)).toContain(
      'Implement rate limiting in API gateway',
    );
  });

  it('formats HubSpot and Salesforce CRM call logs properly', () => {
    const hubSpot = formatHubSpotCallEngagement({
      hostEmail: 'ada@meetit.app',
      contactEmail: 'client@acme.com',
      durationMs: 1800000,
      body: 'Quarterly review call completed with client.',
      recordingUrl: 'https://cdn.meetit.app/rec.mp4',
    });

    expect(hubSpot.engagement.type).toBe('CALL');
    expect(hubSpot.metadata.toNumber).toBe('client@acme.com');
    expect(hubSpot.metadata.durationMilliseconds).toBe(1800000);

    const salesforce = formatSalesforceActivity({
      subject: 'Demo Presentation',
      contactId: '003123456789ABC',
      durationMinutes: 30,
      description: 'Discussed enterprise tier deployment.',
    });

    expect(salesforce.Subject).toBe('MeetIT Call: Demo Presentation');
    expect(salesforce.CallDurationInSeconds).toBe(1800);
    expect(salesforce.WhoId).toBe('003123456789ABC');
  });
});
