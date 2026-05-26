export const config = { runtime: 'edge' };

export default async function handler(req) {
  const clientId     = process.env.SHOPIFY_CLIENT_ID;
  const shopDomain   = process.env.SHOPIFY_SHOP_DOMAIN || 'aezzbt-ny.myshopify.com';
  const redirectUri  = 'https://catalogr-three.vercel.app/api/auth/callback';
  const scopes       = 'read_products,write_products';
  const state        = crypto.randomUUID();

  const url = `https://${shopDomain}/admin/oauth/authorize?client_id=${clientId}&scope=${scopes}&redirect_uri=${encodeURIComponent(redirectUri)}&state=${state}`;

  return Response.redirect(url, 302);
}
