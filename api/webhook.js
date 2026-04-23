import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(Buffer.from(chunk)));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const sig = req.headers['stripe-signature'];
  if (!sig || !process.env.STRIPE_WEBHOOK_SECRET) {
    return res.status(400).json({ error: 'Missing signature or webhook secret' });
  }

  let event;
  try {
    const rawBody = await getRawBody(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook verification failed:', err.message);
    return res.status(400).json({ error: err.message });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    if (session.payment_status !== 'paid') return res.status(200).json({ received: true });

    const name = session.metadata.attendee_name;
    const email = session.customer_email || session.metadata.attendee_email;
    const quantity = parseInt(session.metadata.quantity, 10);
    const ticketWord = quantity === 1 ? 'ticket' : 'tickets';
    const total = (quantity * 35).toFixed(2);
    const apiKey = process.env.RESEND_API_KEY;

    try {
      await Promise.all([
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'KON.X.ION <events@konxion.us>',
            to: ['steve@konxion.us'],
            reply_to: email,
            subject: `Ticket Sale — ${name} · ${quantity} ${ticketWord} · $${total}`,
            html: `
              <div style="font-family:sans-serif;max-width:480px;padding:32px;background:#fff;">
                <h2 style="color:#046303;margin:0 0 24px;">New Ticket Sale</h2>
                <table style="width:100%;border-collapse:collapse;">
                  <tr><td style="padding:8px 0;color:#666;font-size:14px;width:80px;">Name</td><td style="padding:8px 0;font-size:14px;font-weight:600;">${name}</td></tr>
                  <tr><td style="padding:8px 0;color:#666;font-size:14px;">Email</td><td style="padding:8px 0;font-size:14px;">${email}</td></tr>
                  <tr><td style="padding:8px 0;color:#666;font-size:14px;">Tickets</td><td style="padding:8px 0;font-size:14px;">${quantity} × GA</td></tr>
                  <tr><td style="padding:8px 0;color:#666;font-size:14px;">Total</td><td style="padding:8px 0;font-size:14px;font-weight:700;color:#046303;">$${total} USD</td></tr>
                </table>
              </div>
            `,
          }),
        }),
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: 'KON.X.ION <events@konxion.us>',
            to: [email],
            subject: "You're in — KON.X.ION · July 18",
            html: `
              <div style="font-family:sans-serif;max-width:480px;padding:32px;background:#000;color:#fff;">
                <h2 style="color:#04c80a;margin:0 0 8px;letter-spacing:0.1em;">KON.X.ION</h2>
                <p style="color:rgba(255,255,255,0.5);font-size:12px;letter-spacing:0.2em;text-transform:uppercase;margin:0 0 32px;">Saturday, July 18 · Bethel Lozana, Guatapé</p>
                <p style="font-size:18px;margin:0 0 16px;">Hey ${name},</p>
                <p style="color:rgba(255,255,255,0.75);line-height:1.7;margin:0 0 24px;">
                  You're confirmed. <strong style="color:#04c80a;">${quantity} ${ticketWord}</strong> reserved for KON.X.ION.<br><br>
                  We'll send arrival details as the date approaches. See you July 18.
                </p>
                <div style="border:1px solid rgba(4,200,10,0.3);border-radius:8px;padding:20px;margin:0 0 24px;">
                  <div style="font-size:12px;color:rgba(255,255,255,0.4);letter-spacing:0.15em;text-transform:uppercase;margin-bottom:8px;">Event Details</div>
                  <div style="font-size:15px;color:#fff;line-height:1.8;">
                    Bethel Lozana<br>Guatapé, Antioquia, Colombia<br>Saturday, July 18 · 1PM — 5AM
                  </div>
                </div>
                <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">Questions? Reply to this email or reach us at steve@konxion.us</p>
              </div>
            `,
          }),
        }),
      ]);
    } catch (err) {
      console.error('Email send error:', err);
    }
  }

  return res.status(200).json({ received: true });
}
