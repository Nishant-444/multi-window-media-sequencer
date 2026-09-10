// Resilient WebSocket Client for Real-Time Synchronization

class WebSocketService {
  constructor() {
    this.ws = null;
    this.listeners = new Map();
    this.statusListeners = new Set();
    this.status = 'DISCONNECTED'; // 'CONNECTED', 'CONNECTING', 'DISCONNECTED'
    this.reconnectTimeout = null;
    this.reconnectAttempts = 0;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setStatus('CONNECTING');

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}/ws`;

    try {
      this.ws = new WebSocket(host);

      this.ws.onopen = () => {
        this.setStatus('CONNECTED');
        this.reconnectAttempts = 0;
        console.log('[WebSocket] Connected successfully to:', host);
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          this.notifyListeners(message.type, message.payload);
        } catch (err) {
          console.error('[WebSocket] Failed to parse message JSON:', err);
        }
      };

      this.ws.onclose = () => {
        this.setStatus('DISCONNECTED');
        this.scheduleReconnect();
      };

      this.ws.onerror = (err) => {
        console.warn('[WebSocket] Connection error:', err);
        this.ws.close();
      };
    } catch (err) {
      this.setStatus('DISCONNECTED');
      this.scheduleReconnect();
    }
  }

  scheduleReconnect() {
    if (this.reconnectTimeout) return;

    this.reconnectAttempts++;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 10000);
    console.log(`[WebSocket] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})...`);

    this.reconnectTimeout = setTimeout(() => {
      this.reconnectTimeout = null;
      this.connect();
    }, delay);
  }

  setStatus(status) {
    this.status = status;
    this.statusListeners.forEach(listener => listener(status));
  }

  onStatusChange(listener) {
    this.statusListeners.add(listener);
    listener(this.status);
    return () => this.statusListeners.delete(listener);
  }

  subscribe(eventType, callback) {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType).add(callback);

    // Return an unsubscribe function
    return () => {
      const callbacks = this.listeners.get(eventType);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  notifyListeners(eventType, payload) {
    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      callbacks.forEach(cb => {
        try {
          cb(payload);
        } catch (e) {
          console.error(`[WebSocket] Error in ${eventType} callback:`, e);
        }
      });
    }
  }

  disconnect() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}

export const wsService = new WebSocketService();
