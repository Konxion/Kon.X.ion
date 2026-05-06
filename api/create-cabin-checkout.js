const ORIGIN = 'https://konxion.us';

const CABIN_PRODUCTS = {
  luxury:  { name: 'KON.X.ION — Luxury Cabin',  description: 'Sleeps 2–4 · California King or 2 Double Beds · Hot tub · Room service · WiFi · Admission included', price: 41900 },
  premium: { name: 'KON.X.ION — Premium Cabin', description: 'Sleeps 4 · 2 Double Beds · Hot tub · Room service · WiFi · Admission included',                    price: 24900 },
};

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

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() ?? 'unknown';
  if (isRateLimited(ip)) return res.status(429).json({ error: 'Too many requests' });

  const { name, cabinType } = req.body ?? {};

  if (!name || !cabinType) return res.status(400).json({ error: 'Missing required fields' });

  const product = CABIN_PRODUCTS[cabinType];
  if (!product) return res.status(400).json({ error: 'Invalid cabin type' });

  const params = new URLSearchParams({
    'ui_mode': 'embedded_page',
    'mode': 'payment',
    'return_url': `${ORIGIN}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(product.price),
    'line_items[0][price_data][product_data][name]': product.name,
    'line_items[0][price_data][product_data][description]': product.description,
    'line_items[0][quantity]': '1',
    'metadata[attendee_name]': name,
    'metadata[cabin_type]': cabinType,
    'metadata[product]': 'cabin',
  });

  try {
    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      console.error('Stripe cabin error:', session.error);
      return res.status(500).json({ error: session.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Cabin checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
