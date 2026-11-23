import { EventSourceInitDict } from 'event-source-polyfill';
import { getToken } from '../services/api'; // assumes a function to get auth token

let eventSource: EventSource | null = null;
let reconnectDelay = 1000; // start 1s
const maxDelay = 30000; // 30s

export function startEventSource(onMessage: (data: any) => void) {
  if (eventSource) return; // already running
  const token = getToken();
  const clientId = localStorage.getItem('clientId') || crypto.randomUUID();
  localStorage.setItem('clientId', clientId);
  const url = `/api/events`;
  const headers = new Headers({
    Authorization: `Bearer ${token}`,
    'X-Client-Id': clientId,
  });
  const init: EventSourceInitDict = { headers } as any;
  eventSource = new EventSource(url, init);

  eventSource.onmessage = (e) => {
    try {
      const parsed = JSON.parse(e.data);
      if (parsed.origin !== clientId) onMessage(parsed);
    } catch {}
  };
  eventSource.onerror = () => {
    // Cleanup and schedule reconnect
    stopEventSource();
    setTimeout(() => {
      reconnectDelay = Math.min(reconnectDelay * 2, maxDelay);
      startEventSource(onMessage);
    }, reconnectDelay);
  };
}

export function stopEventSource() {
  if (eventSource) {
    eventSource.close();
    eventSource = null;
  }
}

