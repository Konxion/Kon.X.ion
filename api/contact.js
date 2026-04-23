export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, message } = req.body;

  if (!name || !email || !message) {
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

  const payload = {
    from: 'KON.X.ION <events@konxion.us>',
    to: ['konxion@icloud.com'],
    reply_to: email,
    subject: `Message from ${name}`,
    html: `
      <div style="font-family:sans-serif;max-width:480px;padding:32px;background:#fff;">
        <h2 style="color:#046303;margin:0 0 24px;">New Message</h2>
        <table style="width:100%;border-collapse:collapse;">
          <tr><td style="padding:8px 0;color:#666;font-size:14px;">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${name}</td></tr>
          <tr><td style="padding:8px 0;color:#666;font-size:14px;">Email</td><td style="padding:8px 0;font-size:14px;">${email}</td></tr>
        </table>
        <div style="margin:20px 0;padding:16px;background:#f5f5f5;border-radius:8px;font-size:14px;line-height:1.7;white-space:pre-wrap;">${message}</div>
        <p style="margin:0;font-size:12px;color:#999;">Reply to this email to respond directly to ${name}.</p>
      </div>
    `
  };

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      console.error('Resend error:', err);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('Contact handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
