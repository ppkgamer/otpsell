const { WebSocketServer } = require('ws');
const jwt = require('jsonwebtoken');
const { getAccessibleGmailIds } = require('./access');

const WS_PATH = '/ws/otp';
const HEARTBEAT_MS = 30000;
const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

// gmailAccountId -> Set<ws>. A socket is only ever added to the ids its own
// authenticated JWT was granted access to (same rule as GET /api/otp), so a
// broadcast to one gmailAccountId can never reach another user's socket.
const subscriptionsByGmailId = new Map();

function subscribe(ws, gmailIds) {
  ws._gmailIds = gmailIds;
  for (const id of gmailIds) {
    if (!subscriptionsByGmailId.has(id)) subscriptionsByGmailId.set(id, new Set());
    subscriptionsByGmailId.get(id).add(ws);
  }
}

function unsubscribe(ws) {
  for (const id of ws._gmailIds || []) {
    const set = subscriptionsByGmailId.get(id);
    if (!set) continue;
    set.delete(ws);
    if (set.size === 0) subscriptionsByGmailId.delete(id);
  }
  ws._gmailIds = [];
}

async function sendInitialSnapshot(ws, prisma, gmailIds, limit) {
  if (gmailIds.length === 0) {
    ws.send(JSON.stringify({ type: 'initial', otps: [] }));
    return;
  }
  const otps = await prisma.otp.findMany({
    where: { gmailAccountId: { in: gmailIds } },
    include: { gmailAccount: { select: { email: true } } },
    orderBy: { receivedAt: 'desc' },
    take: limit,
  });
  const seen = new Set();
  const deduped = otps.filter((o) => {
    if (seen.has(o.messageId)) return false;
    seen.add(o.messageId);
    return true;
  });
  ws.send(JSON.stringify({ type: 'initial', otps: deduped }));
}

function initWsServer(httpServer, prisma) {
  const wss = new WebSocketServer({ noServer: true });

  httpServer.on('upgrade', (req, socket, head) => {
    const { pathname } = new URL(req.url, 'http://internal');
    if (pathname !== WS_PATH) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', async (ws, req) => {
    try {
      const { searchParams } = new URL(req.url, 'http://internal');
      const token = searchParams.get('token');
      const limit = Math.min(parseInt(searchParams.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT);
      if (!token) return ws.close(4000, 'token required');

      // Same JWT the REST API expects as `Authorization: Bearer <token>` —
      // decoded exactly like middleware/auth.js does.
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch {
        return ws.close(4001, 'invalid token');
      }

      const { userId, role } = decoded;
      const gmailIds = await getAccessibleGmailIds(userId, role);

      await sendInitialSnapshot(ws, prisma, gmailIds, limit);
      subscribe(ws, gmailIds);

      ws.isAlive = true;
      ws.on('pong', () => { ws.isAlive = true; });
      ws.on('close', () => unsubscribe(ws));
      ws.on('error', () => unsubscribe(ws));
    } catch (err) {
      console.error('[ws] connection error:', err.message);
      try { ws.close(1011, 'server error'); } catch {}
    }
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients) {
      if (ws.isAlive === false) {
        unsubscribe(ws);
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return wss;
}

// Called after a poll cycle inserts new rows. `entries` is the same array
// passed to prisma.otp.createMany — each item has messageId + gmailAccountId.
// Only re-queries/broadcasts to gmail accounts that actually have a live
// subscriber, so idle periods with no connected customers cost nothing extra.
async function notifyNewOtps(prisma, entries) {
  if (!entries || entries.length === 0) return;

  const relevantGmailIds = [...new Set(entries.map((e) => e.gmailAccountId))]
    .filter((id) => subscriptionsByGmailId.has(id));
  if (relevantGmailIds.length === 0) return;

  const messageIds = entries
    .filter((e) => relevantGmailIds.includes(e.gmailAccountId))
    .map((e) => e.messageId);

  const rows = await prisma.otp.findMany({
    where: {
      messageId: { in: messageIds },
      gmailAccountId: { in: relevantGmailIds },
    },
    include: { gmailAccount: { select: { email: true } } },
  });

  for (const row of rows) {
    const sockets = subscriptionsByGmailId.get(row.gmailAccountId);
    if (!sockets || sockets.size === 0) continue;
    const payload = JSON.stringify({ type: 'new_otp', otp: row });
    for (const ws of sockets) {
      if (ws.readyState === ws.OPEN) ws.send(payload);
    }
  }
}

module.exports = { initWsServer, notifyNewOtps };
