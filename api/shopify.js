export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  try {
    const { shopDomain, clientId, clientSecret, product } = await req.json();

    if (!shopDomain || !clientId || !clientSecret || !product) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // Get access token via Client Credentials
    const tokenRes = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type:'client_credentials', client_id:clientId, client_secret:clientSecret }),
    });

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return new Response(JSON.stringify({ error: 'Token request failed: ' + err }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    const { access_token } = await tokenRes.json();

    const categoryTags = {
      'books-music':   'Books, Music',
      'books-art':     'Books, Art',
      'books-other':   'Books, Other',
      'objects-music': 'Objects, Music',
      'objects-art':   'Objects, Art',
      'objects-other': 'Objects, Other',
    };

    const metaLine = [
      product.author    ? `Author: ${product.author}`       : null,
      product.publisher ? `Publisher: ${product.publisher}` : null,
      product.year      ? `Year: ${product.year}`           : null,
      product.grade     ? `Condition: ${product.grade}`     : null,
      product.isbn      ? `ISBN: ${product.isbn}`           : null,
    ].filter(Boolean).join(' · ');

    const bodyHtml = [
      product.description || '',
      metaLine ? `<p><small>${metaLine}</small></p>` : ''
    ].filter(Boolean).join('\n');

    const shopifyProduct = {
      product: {
        title: product.title,
        body_html: bodyHtml,
        vendor: 'Sample Books',
        product_type: product.category?.startsWith('books') ? 'Book' : 'Object',
        tags: categoryTags[product.category] || 'Books, Other',
        status: 'draft',
        variants: [{
          price: (product.price || 0).toString(),
          sku: product.isbn || '',
          weight: product.weight || 400,
          weight_unit: 'g',
          inventory_management: 'shopify',
          inventory_policy: 'deny',
          inventory_quantity: 1,
        }],
        images: product.imageBase64 ? [{
          attachment: product.imageBase64.replace(/^data:image\/\w+;base64,/, '')
        }] : [],
      }
    };

    const productRes = await fetch(`https://${shopDomain}/admin/api/2024-10/products.json`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Shopify-Access-Token': access_token },
      body: JSON.stringify(shopifyProduct)
    });

    const data = await productRes.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
