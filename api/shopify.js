export const config = { runtime: 'edge' };

export default async function handler(req) {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      }
    });
  }
  if (req.method !== 'POST') {
    return new Response('Method not allowed', { status: 405 });
  }
  try {
    const { shopDomain, clientId, clientSecret, product } = await req.json();
    if (!shopDomain || !clientId || !clientSecret || !product) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    // Step 1: Get access token via Client Credentials grant
    const tokenRes = await fetch(
      `https://${shopDomain}/admin/oauth/access_token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      }
    );

    if (!tokenRes.ok) {
      const err = await tokenRes.text();
      return new Response(JSON.stringify({ error: 'Token request failed: ' + err }), {
        status: 401,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const { access_token } = await tokenRes.json();

    // Step 2: Create product
    const categoryTags = {
      'books-music': 'Books, Music',
      'books-art': 'Books, Art',
      'books-other': 'Books, Goodies',
      'objects-music': 'Objects, Music',
      'objects-art': 'Objects, Art',
      'objects-other': 'Objects, Goodies',
    };

    const shopifyProduct = {
      product: {
        title: product.title,
        body_html: product.description || '',
        vendor: 'Sample Books',
        product_type: product.category?.startsWith('books') ? 'Book' : 'Object',
        tags: categoryTags[product.category] || 'Goodies',
        status: 'draft',
        variants: [{
          price: product.price?.toString() || '0',
          inventory_management: null,
          inventory_policy: 'continue',
        }],
        images: product.imageBase64 ? [{
          attachment: product.imageBase64.replace(/^data:image\/\w+;base64,/, '')
        }] : []
      }
    };

    const productRes = await fetch(
      `https://${shopDomain}/admin/api/2026-04/products.json`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': access_token,
        },
        body: JSON.stringify(shopifyProduct)
      }
    );

    const data = await productRes.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
