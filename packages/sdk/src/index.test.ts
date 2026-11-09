import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MeetIt } from './MeetIt.js';

class MockElement {
  tagName: string;
  children: MockElement[] = [];
  parentElement: MockElement | null = null;
  src = '';
  style: Record<string, string> = {};
  allow = '';
  attributes: Record<string, string> = {};
  contentWindow = {
    postMessage: vi.fn(),
  };

  constructor(tagName: string) {
    this.tagName = tagName.toUpperCase();
  }

  appendChild(child: MockElement) {
    child.parentElement = this;
    this.children.push(child);
  }

  removeChild(child: MockElement) {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parentElement = null;
    }
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }
}

describe('@meetit/sdk MeetIt.embed', () => {
  let container: MockElement;
  let listeners: Record<string, ((e: any) => void)[]> = {};

  beforeEach(() => {
    listeners = {};
    container = new MockElement('div');

    (globalThis as any).document = {
      createElement: (tagName: string) => new MockElement(tagName),
      getElementById: (id: string) =>
        id === 'test-container' ? container : null,
    };

    (globalThis as any).window = {
      addEventListener: (type: string, fn: any) => {
        listeners[type] = listeners[type] || [];
        listeners[type].push(fn);
      },
      removeEventListener: (type: string, fn: any) => {
        if (listeners[type]) {
          listeners[type] = listeners[type].filter((f) => f !== fn);
        }
      },
      dispatchEvent: (event: any) => {
        if (listeners[event.type]) {
          for (const fn of listeners[event.type]) {
            fn(event);
          }
        }
      },
    };
  });

  afterEach(() => {
    delete (globalThis as any).document;
    delete (globalThis as any).window;
  });

  it('embeds an iframe with the expected URL, attributes, and permissions', () => {
    const instance = MeetIt.embed(container as unknown as HTMLElement, {
      roomCode: 'gzh-kfwu-wqt',
      token: 'guest-tok-123',
      displayName: 'Ada Lovelace',
      theme: 'dark',
      audioMuted: true,
      videoEnabled: false,
      hideLogo: true,
      primaryColor: '#2457ff',
    });

    const iframe = instance.getIframe() as unknown as MockElement;
    expect(iframe).toBeDefined();
    expect(iframe.tagName).toBe('IFRAME');
    expect(iframe.allow).toContain('camera');
    expect(iframe.allow).toContain('microphone');
    expect(iframe.allow).toContain('display-capture');

    const src = new URL(iframe.src);
    expect(src.pathname).toBe('/m/gzh-kfwu-wqt');
    expect(src.searchParams.get('token')).toBe('guest-tok-123');
    expect(src.searchParams.get('name')).toBe('Ada Lovelace');
    expect(src.searchParams.get('theme')).toBe('dark');
    expect(src.searchParams.get('muted')).toBe('1');
    expect(src.searchParams.get('cam')).toBe('0');
    expect(src.searchParams.get('hideLogo')).toBe('1');
    expect(src.searchParams.get('color')).toBe('2457ff');
    expect(src.searchParams.get('embed')).toBe('1');

    instance.destroy();
    expect(container.children.length).toBe(0);
  });

  it('sends command postMessages to the iframe contentWindow', () => {
    const instance = MeetIt.embed(container as unknown as HTMLElement, {
      roomCode: 'abc-defg-hij',
    });

    const iframe = instance.getIframe() as unknown as MockElement;
    const postMessageSpy = vi.spyOn(iframe.contentWindow, 'postMessage');

    instance.setMic(false);
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'meetit:cmd:set_mic', payload: { enabled: false } },
      '*',
    );

    instance.setCamera(true);
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'meetit:cmd:set_camera', payload: { enabled: true } },
      '*',
    );

    instance.sendChat('Hello everyone!');
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'meetit:cmd:send_chat', payload: { text: 'Hello everyone!' } },
      '*',
    );

    instance.leave();
    expect(postMessageSpy).toHaveBeenCalledWith(
      { type: 'meetit:cmd:leave' },
      '*',
    );

    instance.destroy();
  });

  it('receives cross-origin event messages and triggers event listeners', () => {
    const instance = MeetIt.embed(container as unknown as HTMLElement, {
      roomCode: 'abc-defg-hij',
    });

    const readyListener = vi.fn();
    const joinListener = vi.fn();

    const unsubReady = instance.on('ready', readyListener);
    instance.on('joined', joinListener);

    // Simulate window message from embedded call
    window.dispatchEvent({
      type: 'message',
      data: { type: 'meetit:event:ready' },
    });
    expect(readyListener).toHaveBeenCalledTimes(1);

    window.dispatchEvent({
      type: 'message',
      data: {
        type: 'meetit:event:joined',
        payload: {
          roomCode: 'abc-defg-hij',
          selfId: 'p-1',
          displayName: 'Ada',
        },
      },
    });
    expect(joinListener).toHaveBeenCalledWith({
      roomCode: 'abc-defg-hij',
      selfId: 'p-1',
      displayName: 'Ada',
    });

    // Unsubscribe
    unsubReady();
    window.dispatchEvent({
      type: 'message',
      data: { type: 'meetit:event:ready' },
    });
    expect(readyListener).toHaveBeenCalledTimes(1);

    instance.destroy();
  });
});
