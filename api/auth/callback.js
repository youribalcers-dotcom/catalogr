export const config = { runtime: 'edge' };

export default async function handler(req) {
  const url  = new URL(req.url);
  const code = url.searchParams.get('code');
  const shop = url.searchParams.get('shop');

  if (!code || !shop) {
    return new Response('Missing code or shop', { status: 400 });
  }

  const clientId     = process.env.SHOPIFY_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET;

  // Exchange code for permanent access token
  const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });

  if (!tokenRes.ok) {
    const err = await tokenRes.text();
    return new Response('Token exchange failed: ' + err, { status: 500 });
  }

  const { access_token } = await tokenRes.json();

  // Store token in Upstash KV
  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  await fetch(`${kvUrl}/set/catalogr_shopify_token`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${kvToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ value: access_token }),
  });

  // Redirect back to Catalogr with success
  return Response.redirect('https://catalogr-three.vercel.app?shopify=connected', 302);
}
