// Daily allowances for new designs: one per caller, and one for the whole server as a
// kill switch on cost. Kept in memory, so a restart (every deploy is one) starts the day's
// counts again from zero. That's fine for a single server; OpenAI's hard monthly spend
// limit is the last line of defense. A limit left out is unlimited.
export function createDailyLimits({ perIp = Infinity, perDay = Infinity, now = Date.now }) {
  let day = '';
  let total = 0;
  let byIp = new Map();

  return {
    // Uses up one design for this caller and returns null, or returns which limit is in
    // the way ('ip' or 'day') without using anything up.
    take(ip) {
      // A new UTC day starts everyone again, and drops yesterday's addresses from memory.
      const today = new Date(now()).toISOString().slice(0, 10);
      if (today !== day) {
        day = today;
        total = 0;
        byIp = new Map();
      }
      const used = byIp.get(ip) ?? 0;
      if (used >= perIp) return 'ip';
      if (total >= perDay) return 'day';
      byIp.set(ip, used + 1);
      total += 1;
      return null;
    },

    // Hands back one use this caller took, for work that never happened (the image
    // model was too busy and charged nothing). A request that started just before
    // midnight UTC can at worst give the new day one extra, which is harmless.
    giveBack(ip) {
      const used = byIp.get(ip);
      if (!used) return;
      byIp.set(ip, used - 1);
      total -= 1;
    },
  };
}

// The address a request is counted against. Behind a host's proxy (TRUST_PROXY) every
// connection comes from the proxy, so the customer is the first X-Forwarded-For entry.
// Without a proxy that header is whatever the caller typed, so it's ignored. Even behind
// one, a caller can put a made-up address first, which is why the whole-server cap exists.
export function clientIp(req, trustProxy) {
  if (trustProxy) {
    const first = String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim();
    if (first) return first;
  }
  return req.socket.remoteAddress || 'unknown';
}
