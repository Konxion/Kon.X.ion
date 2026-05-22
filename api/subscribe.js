const hits = new Map();
const WINDOW = 60_000;
const LIMIT  = 3;

function isRateLimited(ip) {
  const now   = Date.now();
  const entry = hits.get(ip) ?? { count: 0, start: now };
  if (now - entry.start > WINDOW) { hits.set(ip, { count: 1, start: now }); return false; }
  if (entry.count >= LIMIT) return true;
  entry.count++;
  hits.set(ip, entry);
  return false;
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests' });

  const { email, name } = req.body ?? {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }
  const safeName = name ? String(name).slice(0, 100).replace(/[<>]/g, '') : '';

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'Server configuration error' });

  // Add to Resend audience if configured
  const audienceId = process.env.RESEND_AUDIENCE_ID;
  if (audienceId) {
    try {
      await fetch(`https://api.resend.com/audiences/${audienceId}/contacts`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, first_name: safeName || undefined, unsubscribed: false }),
      });
    } catch (err) {
      console.error('Audience add error:', err);
    }
  }

  // Notify operator
  const notifyPromise = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'KON.X.ION <events@konxion.us>',
      to: ['konxion@icloud.com'],
      subject: `New subscriber — ${safeName || email}`,
      html: `<div style="font-family:sans-serif;padding:24px;max-width:480px;">
        <h2 style="color:#046303;margin:0 0 16px;">New Email Subscriber</h2>
        ${safeName ? `<p style="font-size:15px;margin:0 0 4px;"><strong>${safeName}</strong></p>` : ''}
        <p style="font-size:15px;margin:0;">${email}</p>
        <p style="color:#666;font-size:13px;margin:8px 0 0;">Subscribed via konxion.us popup</p>
      </div>`,
    }),
  });

  // Welcome email to subscriber
  const welcomePromise = fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: 'KON.X.ION <events@konxion.us>',
      to: [email],
      subject: "You're on the list — KON.X.ION · July 18",
      html: `<div style="font-family:sans-serif;max-width:480px;padding:32px;background:#000;color:#fff;">
        <h2 style="color:#04c80a;margin:0 0 6px;letter-spacing:0.1em;font-size:22px;">KON.X.ION</h2>
        <p style="color:rgba(255,255,255,0.45);font-size:11px;letter-spacing:0.22em;text-transform:uppercase;margin:0 0 32px;">
          Saturday, July 18 · Bethel Lozana, Guatapé
        </p>
        <p style="font-size:16px;color:rgba(255,255,255,0.85);line-height:1.7;margin:0 0 24px;">
          ${safeName ? `Hey ${safeName} — you're` : "You're"} on the list. We'll be in touch with updates, lineup reveals, and early access before tickets sell out.
        </p>
        <div style="border:1px solid rgba(4,200,10,0.25);border-radius:10px;padding:20px;margin:0 0 28px;">
          <div style="font-size:11px;color:rgba(4,200,10,0.6);letter-spacing:0.2em;text-transform:uppercase;margin-bottom:10px;">What's Coming</div>
          <div style="font-size:14px;color:rgba(255,255,255,0.7);line-height:1.9;">
            Bethel Lozana, Guatapé<br>
            Emerald reservoir · Bamboo dome cabins · Live music until 5AM<br>
            <span style="color:#04c80a;">Limited to 120</span>
          </div>
        </div>
        <a href="https://konxion.us" style="display:inline-block;background:rgba(4,200,10,0.9);color:#000;font-family:sans-serif;font-size:12px;letter-spacing:0.2em;text-transform:uppercase;font-weight:600;text-decoration:none;padding:14px 32px;border-radius:999px;">
          Get Tickets →
        </a>
        <p style="margin:28px 0 0;color:rgba(255,255,255,0.25);font-size:11px;">
          You received this because you subscribed at konxion.us. Reply to unsubscribe.
        </p>
      </div>`,
    }),
  });

  try {
    await Promise.all([notifyPromise, welcomePromise]);
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Subscribe handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
