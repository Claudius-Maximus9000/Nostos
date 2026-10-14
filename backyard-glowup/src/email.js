import { MODES, STYLES } from './presets.js';

const RESEND_URL = 'https://api.resend.com/emails';
export const DEFAULT_LEAD_FROM = 'Backyard Glow Up <onboarding@resend.dev>';

function oneLine(text) {
  return text.replace(/\s+/g, ' ').trim();
}

// The owner's copy of a Get This Built request. It goes only to the owner, so it carries
// the customer's details. None of it is ever logged. `saved: false` means the server
// couldn't save the request (usually a full disk), so the email says it's the only copy.
export function leadEmail(lead, design, { saved = true } = {}) {
  const lines = ['New Get This Built request', ''];
  if (!saved) {
    lines.push(
      'The server could not save this request (its disk may be full), so this email is the only copy. Keep it.',
      '',
    );
  }
  lines.push(
    `Name: ${lead.name}`,
    `Phone: ${lead.phone || '(none)'}`,
    `Email: ${lead.email || '(none)'}`,
    `ZIP: ${lead.zip}`,
    `Notes: ${lead.notes || '(none)'}`,
    '',
  );
  if (design) {
    const plan = Object.hasOwn(MODES, design.mode) ? MODES[design.mode] : null;
    const items = (design.upgrades ?? []).map((id) => plan?.upgrades.find((u) => u.id === id)?.label ?? id);
    const style = Object.hasOwn(STYLES, design.style) ? STYLES[design.style].label : 'None';
    lines.push(
      `Plan: ${plan?.label ?? design.mode}`,
      `Items: ${items.join(', ')}`,
      `Style: ${style}`,
      `Design id: ${design.id}`,
      `Picture: /outputs/${design.file} (put your server address in front)`,
    );
  } else {
    lines.push('Design: none (sent without a design)');
  }
  lines.push('', `Request id: ${lead.id}`);
  return { subject: `New Get This Built request from ${oneLine(lead.name)}`, text: lines.join('\n') };
}

// Emails each new request to the owner through Resend, so a request never lives only on
// the server's disk. Returns null when the key or the recipient is missing, and the
// server skips the email. The returned function never throws, resolves to whether the
// email was sent (the server needs that when the disk couldn't save the request), and
// logs only the request id and how the send went.
export function createLeadMailer({ apiKey, to, from = DEFAULT_LEAD_FROM, fetchImpl = fetch }) {
  const recipients = (to ?? '').split(',').map((a) => a.trim()).filter(Boolean);
  if (!apiKey || recipients.length === 0) return null;

  return async function mailLead(lead, design, options) {
    try {
      const res = await fetchImpl(RESEND_URL, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: recipients, ...leadEmail(lead, design, options) }),
        signal: AbortSignal.timeout(15_000),
      });
      // The reply body isn't needed; cancelling it frees the connection.
      await res.body?.cancel().catch(() => {});
      if (res.ok) console.log(`[lead] email sent ${lead.id}`);
      else console.error(`[lead] email failed ${lead.id} ${res.status}`);
      return res.ok;
    } catch (err) {
      console.error(`[lead] email failed ${lead.id} ${err.name === 'TimeoutError' ? 'timeout' : 'error'}`);
      return false;
    }
  };
}
