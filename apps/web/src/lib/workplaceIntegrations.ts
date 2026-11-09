/**
 * Workplace & Productivity Integrations Service (Phase 9)
 * - Slack & Microsoft Teams Slash Command & Card Generator
 * - Notion, Linear, GitHub, Jira Action Items Pusher
 * - CRM (HubSpot & Salesforce) & Zapier / Make connectors
 */

export interface ActionItem {
  id: string;
  title: string;
  assignee?: string | undefined;
  dueDate?: string | undefined;
  priority?: 'low' | 'medium' | 'high' | undefined;
}

export interface MeetingSummaryData {
  roomCode: string;
  roomTitle: string;
  hostName: string;
  durationMinutes: number;
  attendeesCount: number;
  actionItems: ActionItem[];
  recordingUrl?: string | undefined;
  transcriptUrl?: string | undefined;
}

/**
 * Builds Slack Block Kit response for `/meetit` slash command.
 */
export function buildSlackSlashResponse(room: {
  code: string;
  title?: string;
  hostName: string;
  roomUrl: string;
}) {
  return {
    response_type: 'in_channel',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*${room.hostName}* started a MeetIT video conference: *${room.title || 'Instant Meeting'}*`,
        },
      },
      {
        type: 'section',
        fields: [
          {
            type: 'mrkdwn',
            text: `*Room Code:*\n\`${room.code}\``,
          },
          {
            type: 'mrkdwn',
            text: `*Status:*\nActive Now`,
          },
        ],
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: {
              type: 'plain_text',
              text: 'Join Meeting',
              emoji: true,
            },
            style: 'primary',
            url: room.roomUrl,
          },
        ],
      },
    ],
  };
}

/**
 * Builds Microsoft Teams Adaptive Card for instant meeting invitations.
 */
export function buildTeamsAdaptiveCard(room: {
  code: string;
  title?: string;
  hostName: string;
  roomUrl: string;
}) {
  return {
    type: 'AdaptiveCard',
    version: '1.4',
    body: [
      {
        type: 'TextBlock',
        size: 'Medium',
        weight: 'Bolder',
        text: room.title || 'MeetIT Meeting',
      },
      {
        type: 'TextBlock',
        text: `Hosted by ${room.hostName} · Room: ${room.code}`,
        isSubtle: true,
        wrap: true,
      },
    ],
    actions: [
      {
        type: 'Action.OpenUrl',
        title: 'Join Video Call',
        url: room.roomUrl,
        style: 'positive',
      },
    ],
  };
}

/**
 * Formats a post-meeting summary card for Slack with action items & recording links.
 */
export function buildSlackSummaryCard(summary: MeetingSummaryData) {
  const actionItemsText =
    summary.actionItems.length > 0
      ? summary.actionItems
          .map(
            (item) =>
              `• [ ] *${item.title}*${item.assignee ? ` (@${item.assignee})` : ''}${item.dueDate ? ` - Due: ${item.dueDate}` : ''}`,
          )
          .join('\n')
      : '_No explicit action items logged._';

  const blocks: unknown[] = [
    {
      type: 'header',
      text: {
        type: 'plain_text',
        text: `Meeting Summary: ${summary.roomTitle}`,
      },
    },
    {
      type: 'section',
      fields: [
        {
          type: 'mrkdwn',
          text: `*Duration:*\n${summary.durationMinutes} mins`,
        },
        {
          type: 'mrkdwn',
          text: `*Attendees:*\n${summary.attendeesCount} participants`,
        },
      ],
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Action Items & Next Steps:*\n${actionItemsText}`,
      },
    },
  ];

  if (summary.recordingUrl) {
    blocks.push({
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `*Cloud Recording:*\n<${summary.recordingUrl}|Watch Recording>`,
      },
    });
  }

  return { blocks };
}

/**
 * Push action items to Linear as tickets.
 */
export async function pushActionItemsToLinear(
  apiKey: string,
  teamId: string,
  items: ActionItem[],
  fetchFn = fetch,
): Promise<{ success: boolean; createdCount: number; errors?: string[] }> {
  if (!apiKey || !teamId || items.length === 0) {
    return {
      success: false,
      createdCount: 0,
      errors: ['Missing API key, teamId, or items'],
    };
  }

  let createdCount = 0;
  const errors: string[] = [];

  for (const item of items) {
    const query = `
      mutation CreateIssue($input: IssueCreateInput!) {
        issueCreate(input: $input) {
          success
          issue { id title url }
        }
      }
    `;

    try {
      const res = await fetchFn('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({
          query,
          variables: {
            input: {
              teamId,
              title: item.title,
              description: `Generated from MeetIT meeting action item. Priority: ${item.priority || 'medium'}.`,
            },
          },
        }),
      });

      if (res.ok) {
        createdCount += 1;
      } else {
        errors.push(`Linear error for "${item.title}": HTTP ${res.status}`);
      }
    } catch (err: any) {
      errors.push(err.message || 'Linear network error');
    }
  }

  return {
    success: createdCount > 0,
    createdCount,
    ...(errors.length > 0 ? { errors } : {}),
  };
}

/**
 * Formats CRM Call Engagement data for HubSpot.
 */
export function formatHubSpotCallEngagement(call: {
  hostEmail: string;
  contactEmail: string;
  durationMs: number;
  body: string;
  recordingUrl?: string;
}) {
  return {
    engagement: {
      active: true,
      type: 'CALL',
      timestamp: Date.now(),
    },
    associations: {
      contactIds: [],
    },
    metadata: {
      toNumber: call.contactEmail,
      fromNumber: call.hostEmail,
      status: 'COMPLETED',
      durationMilliseconds: call.durationMs,
      body: call.body,
      recordingUrl: call.recordingUrl || '',
    },
  };
}

/**
 * Formats CRM Task / Activity for Salesforce.
 */
export function formatSalesforceActivity(call: {
  subject: string;
  contactId: string;
  durationMinutes: number;
  description: string;
}) {
  return {
    Subject: `MeetIT Call: ${call.subject}`,
    Status: 'Completed',
    Priority: 'Normal',
    ActivityDate: new Date().toISOString().split('T')[0],
    CallDurationInSeconds: call.durationMinutes * 60,
    CallType: 'Outbound',
    Description: call.description,
    WhoId: call.contactId,
  };
}
