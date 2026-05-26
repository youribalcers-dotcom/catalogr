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

  const tokenData = await tokenRes.json();

  if (!tokenRes.ok || !tokenData.access_token) {
    return new Response('Token exchange failed: ' + JSON.stringify(tokenData), { status: 500 });
  }

  const access_token = tokenData.access_token;

  // Store token in Upstash KV — correct REST format: /set/key/value
  const kvUrl   = process.env.KV_REST_API_URL;
  const kvToken = process.env.KV_REST_API_TOKEN;

  const kvRes = await fetch(`${kvUrl}/set/catalogr_shopify_token/${encodeURIComponent(access_token)}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${kvToken}` },
  });

  const kvData = await kvRes.json();

  if (kvData.result !== 'OK') {
    return new Response('KV write failed: ' + JSON.stringify(kvData), { status: 500 });
  }

  return Response.redirect('https://catalogr-three.vercel.app?shopify=connected', 302);
}
