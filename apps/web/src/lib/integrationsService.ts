import type { MeetingActionItem, MeetingNoteItem } from './notesStore';

export type IntegrationPlatform = 'linear' | 'notion' | 'asana' | 'google-docs';

export interface IntegrationConfig {
  linearApiKey?: string | undefined;
  linearTeamId?: string | undefined;
  notionApiKey?: string | undefined;
  notionDatabaseId?: string | undefined;
  asanaApiKey?: string | undefined;
  asanaWorkspaceId?: string | undefined;
  webhookUrl?: string | undefined;
}

const STORAGE_KEY = 'meetit_integrations_config_v1';

function getStorage(): Storage | null {
  try {
    if (typeof window !== 'undefined' && window.localStorage)
      return window.localStorage;
    if (typeof localStorage !== 'undefined') return localStorage;
  } catch {
    return null;
  }
  return null;
}

export function loadIntegrationsConfig(): IntegrationConfig {
  try {
    const storage = getStorage();
    if (!storage) return {};
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as IntegrationConfig;
  } catch {
    return {};
  }
}

export function saveIntegrationsConfig(config: IntegrationConfig): void {
  try {
    const storage = getStorage();
    if (storage) {
      storage.setItem(STORAGE_KEY, JSON.stringify(config));
    }
  } catch {
    // Ignore storage quota errors
  }
}

export interface TaskExportResult {
  success: boolean;
  platform: IntegrationPlatform;
  directUrl?: string | undefined;
  externalId?: string | undefined;
  message: string;
}

/**
 * Builds a direct web-intent URL to quickly create tasks in integrations
 */
export function getIntegrationDirectUrl(
  platform: IntegrationPlatform,
  task: Pick<
    MeetingActionItem,
    'text' | 'assignee' | 'meetingTitle' | 'roomCode'
  >,
): string {
  const title = encodeURIComponent(task.text);
  const context = encodeURIComponent(
    `From MeetIT room ${task.roomCode || 'call'}: ${task.meetingTitle || 'Meeting'}${
      task.assignee ? ` | Owner: @${task.assignee}` : ''
    }`,
  );

  switch (platform) {
    case 'linear':
      return `https://linear.app/new?title=${title}&description=${context}`;
    case 'asana':
      return `https://app.asana.com/0/search?term=${title}`;
    case 'notion':
      return `https://www.notion.so/new`;
    case 'google-docs':
      return `https://docs.google.com/document/create`;
  }
}

/**
 * Export a single action item to an external integration (via webhook or API if configured, otherwise direct intent)
 */
export async function exportTaskToIntegration(
  task: MeetingActionItem,
  platform: IntegrationPlatform,
  config: IntegrationConfig = loadIntegrationsConfig(),
): Promise<TaskExportResult> {
  const directUrl = getIntegrationDirectUrl(platform, task);

  // If a generic or platform-specific webhook/API URL is set, deliver the payload
  const endpoint = config.webhookUrl;
  if (endpoint) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_task',
          platform,
          task: {
            id: task.id,
            text: task.text,
            assignee: task.assignee,
            priority: task.priority,
            dueDate: task.dueDate,
            roomCode: task.roomCode,
            meetingTitle: task.meetingTitle,
          },
          timestamp: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        throw new Error(
          `Integration webhook responded with status ${res.status}`,
        );
      }

      return {
        success: true,
        platform,
        directUrl,
        message: `Task successfully synced to ${platform} via webhook`,
      };
    } catch (err) {
      return {
        success: false,
        platform,
        directUrl,
        message: `Failed to push via webhook: ${(err as Error).message}. Opened direct intent link instead.`,
      };
    }
  }

  return {
    success: true,
    platform,
    directUrl,
    message: `Ready in ${platform}. Click link to save.`,
  };
}

/**
 * Batch export all action items from a note
 */
export async function exportAllNoteTasksToIntegration(
  note: MeetingNoteItem,
  tasks: MeetingActionItem[],
  platform: IntegrationPlatform,
  config: IntegrationConfig = loadIntegrationsConfig(),
): Promise<{
  total: number;
  successful: number;
  directUrl?: string | undefined;
}> {
  let successful = 0;
  const directUrl =
    tasks.length > 0 ? getIntegrationDirectUrl(platform, tasks[0]!) : undefined;

  for (const task of tasks) {
    const res = await exportTaskToIntegration(task, platform, config);
    if (res.success) {
      successful++;
    }
  }

  return {
    total: tasks.length,
    successful,
    ...(directUrl ? { directUrl } : {}),
  };
}
