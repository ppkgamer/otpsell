// Mail can become visible in a mailbox a few seconds after its timestamp, so
// each poll re-reads a short window behind the cursor. Otherwise a message that
// is indexed just after a poll falls behind the cursor and is never picked up.
const OVERLAP_MS = 60 * 1000;
const FIRST_POLL_LOOKBACK_MS = 30 * 1000;
const SEEN_TTL_MS = 10 * 60 * 1000;

function getPollSinceMs(account) {
  return account.lastPolledAt
    ? account.lastPolledAt.getTime() - OVERLAP_MS
    : Date.now() - FIRST_POLL_LOOKBACK_MS;
}

// In-memory record of processed messages, so the overlap window does not
// re-fetch mail or re-query the database on every poll.
function hasSeenMessage(account, messageId) {
  return account.seenMessages?.has(messageId) ?? false;
}

function markMessageSeen(account, messageId) {
  if (!account.seenMessages) account.seenMessages = new Map();
  const now = Date.now();
  for (const [id, seenAt] of account.seenMessages) {
    if (now - seenAt > SEEN_TTL_MS) account.seenMessages.delete(id);
  }
  account.seenMessages.set(messageId, now);
}

// OTPs are saved by the caller after the poll returns. Forgetting them here
// means a failed save is retried; a successful one is found by the DB check.
function forgetMessages(account, otps) {
  for (const otp of otps) account.seenMessages?.delete(otp.messageId);
}

module.exports = { getPollSinceMs, hasSeenMessage, markMessageSeen, forgetMessages };
