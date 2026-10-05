/*
 * Cross-tab real-time events (same browser).
 *
 * Uses BroadcastChannel when available and falls back to the
 * `storage` event, so a change made in one tab (login, logout,
 * approval, consent grant, ...) refreshes the other open tabs.
 *
 * Cross-browser / cross-device sync: startServerEvents() opens a Server-Sent
 * Events stream (GET /api/events). The server pushes a data-free DATA_CHANGED
 * signal after any successful change; clients then re-fetch through the normal
 * authorised APIs. (fetch streaming is used instead of EventSource so the JWT
 * travels in the Authorization header, never in the URL.)
 */

export type RealtimeEventType = 'DATA_CHANGED' | 'AUTH_CHANGED' | 'LOGOUT';

export interface RealtimeEvent {
  type: RealtimeEventType;
  /** Optional hint about what changed, e.g. "consent" or "users". */
  scope?: string;
  /** Random id of the tab that emitted the event. */
  source: string;
  at: number;
}

const CHANNEL_NAME = 'fedtrustmed-realtime';
const STORAGE_KEY = 'fedtrustmed_realtime_event';

const TAB_ID =
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `tab-${Math.random().toString(36).slice(2)}`;

const channel: BroadcastChannel | null =
  typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL_NAME) : null;

type Listener = (event: RealtimeEvent) => void;
const listeners = new Set<Listener>();

const dispatch = (event: RealtimeEvent) => {
  // Ignore our own events: a tab already knows about its own change.
  if (!event || event.source === TAB_ID) return;
  listeners.forEach((l) => {
    try {
      l(event);
    } catch (err) {
      console.error('Realtime listener failed:', err);
    }
  });
};

if (channel) {
  channel.onmessage = (msg) => dispatch(msg.data as RealtimeEvent);
} else if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    try {
      dispatch(JSON.parse(e.newValue) as RealtimeEvent);
    } catch {
      /* ignore malformed payloads */
    }
  });
}

export function publishRealtimeEvent(type: RealtimeEventType, scope?: string): void {
  const event: RealtimeEvent = { type, scope, source: TAB_ID, at: Date.now() };
  if (channel) {
    channel.postMessage(event);
  } else {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(event));
    } catch {
      /* storage unavailable */
    }
  }
}

export function subscribeRealtimeEvents(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export const getTabId = (): string => TAB_ID;

/** Opens the server push stream while signed in. Returns a stop function. */
export function startServerEvents(getToken: () => string | null): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let delay = 1000;

  const connect = async () => {
    while (!stopped) {
      const token = getToken();
      if (!token) return;
      controller = new AbortController();
      try {
        const res = await fetch('/api/events', {
          headers: { Authorization: `Bearer ${token}`, Accept: 'text/event-stream' },
          signal: controller.signal,
        });
        if (res.status === 401 || res.status === 403) return; // signed out / frozen: do not retry
        if (!res.ok || !res.body) throw new Error(`events ${res.status}`);
        delay = 1000;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';
        while (!stopped) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let idx: number;
          while ((idx = buffer.indexOf('\n\n')) >= 0) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const line = frame.split('\n').find((l) => l.startsWith('data: '));
            if (!line) continue;
            try {
              const msg = JSON.parse(line.slice(6));
              if (msg.origin === TAB_ID) continue; // our own change: this tab already has it
              dispatch({ type: 'DATA_CHANGED', scope: msg.scope, source: 'server', at: msg.at });
            } catch { /* ignore malformed frame */ }
          }
        }
      } catch {
        if (stopped) return;
      }
      await new Promise((r) => setTimeout(r, delay));
      delay = Math.min(delay * 2, 30000);
    }
  };
  void connect();
  return () => { stopped = true; controller?.abort(); };
}
