const ORIGIN = 'https://konxion.us';
const GA_PRICE_CENTS = 3500;
const MAX_GA_TICKETS = 111;

const hits = new Map();
const WINDOW = 60_000;
const LIMIT  = 5;

function isRateLimited(ip) {
  const now  = Date.now();
  const entry = hits.get(ip) ?? { count: 0, start: now };
  if (now - entry.start > WINDOW) { hits.set(ip, { count: 1, start: now }); return false; }
  if (entry.count >= LIMIT) return true;
  entry.count++;
  hits.set(ip, entry);
  return false;
}

async function countSoldTickets(stripeKey) {
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions?payment_status=paid&limit=100', {
    headers: { 'Authorization': `Bearer ${stripeKey}` },
  });
  const data = await res.json();
  if (!Array.isArray(data.data)) return 0;
  return data.data
    .filter(s => s.metadata?.product !== 'cabin')
    .reduce((sum, s) => sum + (parseInt(s.metadata?.quantity, 10) || 1), 0);
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests' });

  const { name, email, quantity } = req.body ?? {};

  if (!name || !email || !quantity) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email' });
  }

  const qty = parseInt(quantity, 10);
  if (!Number.isInteger(qty) || qty < 1 || qty > 10) {
    return res.status(400).json({ error: 'Invalid quantity' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;

  try {
    const sold = await countSoldTickets(stripeKey);
    const remaining = MAX_GA_TICKETS - sold;
    if (remaining <= 0) {
      return res.status(409).json({ error: 'General admission is sold out.' });
    }
    if (qty > remaining) {
      return res.status(409).json({
        error: `Only ${remaining} ticket${remaining === 1 ? '' : 's'} remaining.`,
      });
    }
  } catch (err) {
    console.error('Inventory check error:', err);
    return res.status(500).json({ error: 'Could not verify availability. Please try again.' });
  }

  const params = new URLSearchParams({
    'ui_mode': 'embedded_page',
    'mode': 'payment',
    'customer_email': email,
    'return_url': `${ORIGIN}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(GA_PRICE_CENTS),
    'line_items[0][price_data][product_data][name]': 'KON.X.ION — General Admission',
    'line_items[0][price_data][product_data][description]': 'Saturday, July 18 · Bethel Lozana, Guatapé, Colombia · 3PM – 5AM',
    'line_items[0][quantity]': String(qty),
    'metadata[attendee_name]': name,
    'metadata[attendee_email]': email,
    'metadata[quantity]': String(qty),
  });

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${stripeKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();

    if (!stripeRes.ok) {
      console.error('Stripe error:', session.error);
      return res.status(500).json({ error: session.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
