const ORIGIN = 'https://konxion.us';
const GA_PRICE_CENTS = 3500;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

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

  const params = new URLSearchParams({
    'ui_mode': 'embedded_page',
    'mode': 'payment',
    'customer_email': email,
    'return_url': `${ORIGIN}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    'line_items[0][price_data][currency]': 'usd',
    'line_items[0][price_data][unit_amount]': String(GA_PRICE_CENTS),
    'line_items[0][price_data][product_data][name]': 'KON.X.ION — General Admission',
    'line_items[0][price_data][product_data][description]': 'Saturday, July 18 · Bethel Lozana, Guatapé, Colombia · 1PM – 5AM',
    'line_items[0][quantity]': String(qty),
    'metadata[attendee_name]': name,
    'metadata[attendee_email]': email,
    'metadata[quantity]': String(qty),
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
      console.error('Stripe error:', session.error);
      return res.status(500).json({ error: session.error?.message || 'Stripe error' });
    }

    return res.status(200).json({ clientSecret: session.client_secret });
  } catch (err) {
    console.error('Checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
