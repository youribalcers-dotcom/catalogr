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
    const { shopDomain, accessToken, product } = await req.json();
    if (!shopDomain || !accessToken || !product) {
      return new Response(JSON.stringify({ error: 'Missing parameters' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    // Category → Shopify collection tag mapping
    const categoryTags = {
      'books-music': 'Books, Music',
      'books-art': 'Books, Art',
      'books-other': 'Books, Other',
      'objects-music': 'Objects, Music',
      'objects-art': 'Objects, Art',
      'objects-other': 'Objects, Other',
    };

    const tags = categoryTags[product.category] || 'Other';

    const shopifyProduct = {
      product: {
        title: product.title,
        body_html: product.description || '',
        vendor: 'Sample Books',
        product_type: product.category?.split('-')[0] === 'books' ? 'Book' : 'Object',
        tags,
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

    const r = await fetch(`https://${shopDomain}/admin/api/2024-01/products.json`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': accessToken,
      },
      body: JSON.stringify(shopifyProduct)
    });

    const data = await r.json();
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
