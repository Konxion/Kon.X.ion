import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
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

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: GA_PRICE_CENTS,
          product_data: {
            name: 'KON.X.ION — General Admission',
            description: 'Saturday, July 18 · Bethel Lozana, Guatapé, Colombia · 1PM – 5AM',
          },
        },
        quantity: qty,
      }],
      mode: 'payment',
      success_url: `${ORIGIN}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${ORIGIN}/`,
      metadata: {
        attendee_name: name,
        attendee_email: email,
        quantity: String(qty),
      },
    });

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
}
