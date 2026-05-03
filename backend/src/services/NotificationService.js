// Manages persistent SSE connections per org.
// Any service calls notify(orgId, event) and it fans out to all active browser tabs for that org.

class NotificationService {
  constructor() {
    // Map<orgId, Set<{ raw: ServerResponse }>>
    this._connections = new Map();
  }

  // Register an SSE connection. Returns an unsubscribe function.
  subscribe(orgId, raw) {
    if (!this._connections.has(orgId)) {
      this._connections.set(orgId, new Set());
    }
    const conn = { raw };
    this._connections.get(orgId).add(conn);
    return () => this._drop(orgId, conn);
  }

  _drop(orgId, conn) {
    const set = this._connections.get(orgId);
    if (!set) return;
    set.delete(conn);
    if (set.size === 0) this._connections.delete(orgId);
  }

  // Push an event to all connections for an org.
  notify(orgId, event) {
    const set = this._connections.get(orgId);
    if (!set || set.size === 0) return;
    const payload = `data: ${JSON.stringify({ ...event, timestamp: new Date().toISOString() })}\n\n`;
    for (const { raw } of set) {
      try { raw.write(payload); } catch (_) { /* ignore closed sockets */ }
    }
  }
}

export const notificationService = new NotificationService();
