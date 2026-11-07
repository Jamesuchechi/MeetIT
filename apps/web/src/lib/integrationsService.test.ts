import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getIntegrationDirectUrl,
  exportTaskToIntegration,
  exportAllNoteTasksToIntegration,
  loadIntegrationsConfig,
  saveIntegrationsConfig,
} from './integrationsService';
import type { MeetingActionItem, MeetingNoteItem } from './notesStore';

describe('integrationsService', () => {
  let localStorageMock: Record<string, string> = {};

  beforeEach(() => {
    localStorageMock = {};
    const storageImpl = {
      getItem: (key: string) => localStorageMock[key] ?? null,
      setItem: (key: string, val: string) => {
        localStorageMock[key] = val;
      },
      removeItem: (key: string) => {
        delete localStorageMock[key];
      },
      clear: () => {
        localStorageMock = {};
      },
      length: 0,
      key: () => null,
    };
    vi.stubGlobal('localStorage', storageImpl);
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'localStorage', {
        value: storageImpl,
        writable: true,
      });
    }
    vi.stubGlobal('fetch', vi.fn());
  });

  it('generates valid web intent URLs for Linear, Asana, Notion, and Google Docs', () => {
    const task: Pick<
      MeetingActionItem,
      'text' | 'assignee' | 'meetingTitle' | 'roomCode'
    > = {
      text: 'Finalize audio pipeline',
      assignee: 'alex',
      meetingTitle: 'Sprint Planning',
      roomCode: 'abc-defg-hij',
    };

    const linearUrl = getIntegrationDirectUrl('linear', task);
    expect(linearUrl).toContain('linear.app/new');
    expect(linearUrl).toContain('Finalize%20audio%20pipeline');

    const asanaUrl = getIntegrationDirectUrl('asana', task);
    expect(asanaUrl).toContain('app.asana.com');

    const notionUrl = getIntegrationDirectUrl('notion', task);
    expect(notionUrl).toBe('https://www.notion.so/new');

    const docsUrl = getIntegrationDirectUrl('google-docs', task);
    expect(docsUrl).toBe('https://docs.google.com/document/create');
  });

  it('persists and loads integration configs correctly', () => {
    saveIntegrationsConfig({
      linearApiKey: 'lin_api_123',
      webhookUrl: 'https://webhook.site/test',
    });

    const loaded = loadIntegrationsConfig();
    expect(loaded.linearApiKey).toBe('lin_api_123');
    expect(loaded.webhookUrl).toBe('https://webhook.site/test');
  });

  it('delivers tasks via webhook when configured', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: 'created' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const task: MeetingActionItem = {
      id: 'task-1',
      ownerId: 'user-1',
      roomCode: 'abc-defg-hij',
      meetingTitle: 'Demo Sync',
      text: 'Ship the feature',
      priority: 'high',
      done: false,
      createdAt: new Date().toISOString(),
    };

    const res = await exportTaskToIntegration(task, 'linear', {
      webhookUrl: 'https://webhook.site/test',
    });

    expect(res.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it('batch exports note action items', async () => {
    const note: MeetingNoteItem = {
      id: 'note-1',
      ownerId: 'user-1',
      roomCode: 'abc-defg-hij',
      meetingTitle: 'Demo Sync',
      meetingDate: new Date().toISOString(),
      summary: 'Executive summary',
      content: 'Detailed notes',
      attendees: ['Alex'],
      tags: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const tasks: MeetingActionItem[] = [
      {
        id: 'task-1',
        ownerId: 'user-1',
        roomCode: 'abc-defg-hij',
        meetingTitle: 'Demo Sync',
        text: 'Task 1',
        priority: 'medium',
        done: false,
        createdAt: new Date().toISOString(),
      },
    ];

    const result = await exportAllNoteTasksToIntegration(note, tasks, 'notion');
    expect(result.total).toBe(1);
    expect(result.successful).toBe(1);
    expect(result.directUrl).toBe('https://www.notion.so/new');
  });
});
