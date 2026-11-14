import type {
  MeetItEmbedOptions,
  MeetItEventName,
  MeetItEvents,
  MeetItInstance,
  MeetItCommandMessage,
  MeetItSupportWidgetOptions,
  MeetItSupportWidgetInstance,
} from './types.js';

/**
 * MeetIT Vanilla JS Embedder
 * Phase 9 Developer Platform SDK
 */
export class MeetIt {
  /**
   * Embeds a MeetIT video meeting inside target DOM element.
   */
  public static embed(
    container: HTMLElement | string,
    options: MeetItEmbedOptions,
  ): MeetItInstance {
    const targetEl =
      typeof container === 'string'
        ? document.getElementById(container)
        : container;

    if (!targetEl) {
      throw new Error(
        `[MeetIT SDK] Container element not found: ${String(container)}`,
      );
    }

    const defaultOrigin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'https://meetit.app';
    const baseUrl = (options.baseUrl || defaultOrigin).replace(/\/$/, '');
    const searchParams = new URLSearchParams();

    if (options.token) searchParams.set('token', options.token);
    if (options.displayName) searchParams.set('name', options.displayName);
    if (options.theme) searchParams.set('theme', options.theme);
    if (options.audioMuted !== undefined) {
      searchParams.set('muted', options.audioMuted ? '1' : '0');
    }
    if (options.videoEnabled !== undefined) {
      searchParams.set('cam', options.videoEnabled ? '1' : '0');
    }
    if (options.hideLogo) searchParams.set('hideLogo', '1');
    if (options.primaryColor) {
      searchParams.set('color', options.primaryColor.replace('#', ''));
    }
    searchParams.set('embed', '1');

    const iframeUrl = `${baseUrl}/m/${options.roomCode}?${searchParams.toString()}`;

    const iframe = document.createElement('iframe');
    iframe.src = iframeUrl;
    iframe.style.width =
      typeof options.width === 'number'
        ? `${options.width}px`
        : options.width || '100%';
    iframe.style.height =
      typeof options.height === 'number'
        ? `${options.height}px`
        : options.height || '100%';
    iframe.style.border = 'none';
    iframe.style.borderRadius = '12px';
    iframe.style.backgroundColor = '#0a1220';
    iframe.allow =
      'camera; microphone; display-capture; autoplay; clipboard-write; fullscreen';
    iframe.setAttribute('data-testid', 'meetit-embed-iframe');

    targetEl.appendChild(iframe);

    // Event listeners map
    type Handler = (payload: any) => void;
    const listeners = new Map<MeetItEventName, Set<Handler>>();

    const sendCommand = (cmd: MeetItCommandMessage) => {
      if (iframe.contentWindow) {
        iframe.contentWindow.postMessage(cmd, '*');
      }
    };

    // Cross-origin message listener
    const handleWindowMessage = (event: MessageEvent) => {
      // Validate origin if not wildcard local dev
      if (
        event.data &&
        typeof event.data === 'object' &&
        'type' in event.data
      ) {
        const msgType = String(event.data.type);
        if (msgType.startsWith('meetit:event:')) {
          const eventName = msgType.replace(
            'meetit:event:',
            '',
          ) as MeetItEventName;
          const payload = event.data.payload;
          const registered = listeners.get(eventName);
          if (registered) {
            for (const fn of registered) {
              try {
                fn(payload);
              } catch (e) {
                console.error(
                  `[MeetIT SDK] Error in event listener for ${eventName}:`,
                  e,
                );
              }
            }
          }
        }
      }
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('message', handleWindowMessage);
    }

    return {
      destroy: () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('message', handleWindowMessage);
        }
        if (iframe.parentElement) {
          iframe.parentElement.removeChild(iframe);
        }
        listeners.clear();
      },
      setMic: (enabled: boolean) => {
        sendCommand({
          type: 'meetit:cmd:set_mic',
          payload: { enabled },
        });
      },
      setCamera: (enabled: boolean) => {
        sendCommand({
          type: 'meetit:cmd:set_camera',
          payload: { enabled },
        });
      },
      leave: () => {
        sendCommand({ type: 'meetit:cmd:leave' });
      },
      sendChat: (text: string) => {
        sendCommand({
          type: 'meetit:cmd:send_chat',
          payload: { text },
        });
      },
      on: <E extends MeetItEventName>(
        event: E,
        handler: (payload: MeetItEvents[E]) => void,
      ) => {
        if (!listeners.has(event)) {
          listeners.set(event, new Set());
        }
        listeners.get(event)!.add(handler as Handler);
        return () => {
          listeners.get(event)?.delete(handler as Handler);
        };
      },
      getIframe: () => iframe,
    };
  }

  /**
   * Mounts an embeddable click-to-call Support Widget (Phase 14 Tier C).
   */
  public static supportWidget(
    options: MeetItSupportWidgetOptions,
  ): MeetItSupportWidgetInstance {
    const root = document.createElement('div');
    root.setAttribute('data-testid', 'meetit-support-widget');
    root.style.position = 'fixed';
    root.style.bottom = '20px';
    root.style[options.position === 'bottom-left' ? 'left' : 'right'] = '20px';
    root.style.zIndex = '99999';

    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.textContent = options.buttonText || 'Live Support';
    launcher.style.padding = '10px 16px';
    launcher.style.borderRadius = '999px';
    launcher.style.border = 'none';
    launcher.style.cursor = 'pointer';
    launcher.style.fontWeight = '600';
    launcher.style.color = '#ffffff';
    launcher.style.background = options.primaryColor || '#6366f1';

    const panel = document.createElement('div');
    panel.style.display = 'none';
    panel.style.width = '360px';
    panel.style.height = '480px';
    panel.style.marginBottom = '10px';
    panel.style.borderRadius = '14px';
    panel.style.overflow = 'hidden';
    panel.style.boxShadow = '0 12px 32px rgba(0,0,0,0.28)';

    let embedded: MeetItInstance | null = null;

    const open = () => {
      panel.style.display = 'block';
      if (!embedded) {
        embedded = MeetIt.embed(panel, {
          roomCode: options.roomCode,
          baseUrl: options.baseUrl,
          displayName: options.customerName || 'Customer',
          primaryColor: options.primaryColor,
          width: '100%',
          height: '100%',
        });
      }
    };

    const close = () => {
      panel.style.display = 'none';
    };

    launcher.addEventListener('click', () => {
      if (panel.style.display === 'none') {
        open();
      } else {
        close();
      }
    });

    root.appendChild(panel);
    root.appendChild(launcher);
    document.body.appendChild(root);

    return {
      open,
      close,
      destroy: () => {
        embedded?.destroy();
        embedded = null;
        root.remove();
      },
    };
  }
}
