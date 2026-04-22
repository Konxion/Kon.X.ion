export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, tickets } = req.body;

  if (!name || !email || !tickets) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const ticketWord = tickets === '1' ? 'ticket' : 'tickets';

  // Notification to organizer
  const notifyPayload = {
    from: 'KON.X.ION <events@konxion.us>',
    to: ['steve@konxion.us'],
    reply_to: email,
    subject: `New RSVP — ${name} (${tickets} ${ticketWord})`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;padding:32px;background:#fff;">
        <h2 style="color:#046303;margin:0 0 24px;">New RSVP</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;font-size:14px;">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#666;font-size:14px;">Email</td><td style="padding:8px 0;font-size:14px;">${email}</td></tr>
          <tr><td style="padding:8px 0;color:#666;font-size:14px;">Tickets</td><td style="padding:8px 0;font-size:14px;">${tickets}</td></tr>
        </table>
        <p style="margin:24px 0 0;font-size:12px;color:#999;">Reply to this email to respond directly to ${name}.</p>
      </div>
    `
  };

  // Confirmation to attendee
  const confirmPayload = {
    from: 'KON.X.ION <events@konxion.us>',
    to: [email],
    subject: "You're on the list — KON.X.ION · July 18",
    html: `
      <div style="font-family:sans-serif;max-width:480px;padding:32px;background:#000;color:#fff;">
        <h2 style="color:#04c80a;margin:0 0 8px;letter-spacing:0.1em;">KON.X.ION</h2>
        <p style="color:rgba(255,255,255,0.5);font-size:12px;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 32px;">Saturday, July 18 · Bethel Lozana, Guatapé</p>
        <p style="font-size:18px;margin:0 0 16px;">Hey ${name},</p>
        <p style="color:rgba(255,255,255,0.75);line-height:1.7;margin:0 0 24px;">
          Your RSVP is confirmed. We've reserved <strong style="color:#04c80a;">${tickets} ${ticketWord}</strong> for you.<br><br>
          We'll send arrival details and any updates to this email as the event approaches.
        </p>
        <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">Questions? Reply to this email or reach us at steve@konxion.us</p>
      </div>
    `
  };

  try {
    const [notifyRes, confirmRes] = await Promise.all([
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(notifyPayload)
      }),
      fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmPayload)
      })
    ]);

    if (!notifyRes.ok || !confirmRes.ok) {
      const err = await notifyRes.json().catch(() => ({}));
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('RSVP handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
