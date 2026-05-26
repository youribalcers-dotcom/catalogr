export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const CX  = '0466e3cd241c9442b';
const API = 'https://www.googleapis.com/customsearch/v1';

// Extract a price from a snippet string
function extractPrice(text) {
  if (!text) return null;
  // Match patterns like €12.50, $45, US$ 32.87, 12,50 €, EUR 30, £9.99
  const patterns = [
    /(?:US\$|USD|\$)\s*(\d+(?:[.,]\d{1,2})?)/i,   // US$ 32.87, $22.00, USD 16
    /(\d+(?:[.,]\d{1,2})?)\s*(?:USD|\$)/i,           // 22.00$
    /(?:€|EUR)\s*(\d+(?:[.,]\d{1,2})?)/i,             // €12.50, EUR 30
    /(\d+(?:[.,]\d{1,2})?)\s*(?:€|EUR)/i,             // 12,50€
    /(?:£|GBP)\s*(\d+(?:[.,]\d{1,2})?)/i,             // £9.99
    /(\d+(?:[.,]\d{1,2})?)\s*(?:£|GBP)/i,             // 9.99£
  ];
  for (const p of patterns) {
    const m = text.match(p);
    if (m) {
      const val = parseFloat(m[1].replace(',', '.'));
      if (val > 0.5 && val < 50000) return val;
    }
  }
  return null;
}

function buildQuery(item) {
  // Build the most precise query possible from identified fields
  const parts = [];
  if (item.title)     parts.push(`"${item.title}"`);
  if (item.author)    parts.push(item.author);
  if (item.publisher) parts.push(item.publisher);
  if (item.year)      parts.push(item.year);
  // Add "for sale" or "prix" to bias toward listing pages
  parts.push('prix OR price OR "for sale" OR "à vendre"');
  return parts.join(' ');
}

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }

  try {
    const body = await req.json();
    const { item, apiKey } = body;

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Google API key required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    if (!item || (!item.title && !item.author && !item.description)) {
      return new Response(JSON.stringify({ error: 'Item data required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    const query = buildQuery(item);
    const url = `${API}?key=${apiKey}&cx=${CX}&q=${encodeURIComponent(query)}&num=10`;

    const res = await fetch(url);
    const data = await res.json();

    if (!res.ok) {
      return new Response(JSON.stringify({
        error: data.error?.message || 'Google Search API error',
        status: res.status
      }), { status: res.status, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    const items = data.items || [];

    // Extract all prices found across snippets and titles
    const prices = [];
    const sources = [];

    for (const result of items) {
      const text = `${result.title || ''} ${result.snippet || ''}`;
      const price = extractPrice(text);
      if (price) {
        prices.push(price);
        sources.push({
          price,
          title: result.title,
          url: result.link,
          snippet: result.snippet,
        });
      }
    }

    let priceRange = null;
    if (prices.length >= 2) {
      prices.sort((a, b) => a - b);
      // Remove outliers: drop bottom 10% and top 10%
      const trim = Math.max(1, Math.floor(prices.length * 0.1));
      const trimmed = prices.slice(trim, prices.length - trim);
      priceRange = {
        low:    Math.round(trimmed[0]),
        high:   Math.round(trimmed[trimmed.length - 1]),
        median: Math.round(trimmed[Math.floor(trimmed.length / 2)]),
        count:  prices.length,
      };
    } else if (prices.length === 1) {
      priceRange = {
        low:    Math.round(prices[0] * 0.8),
        high:   Math.round(prices[0] * 1.2),
        median: Math.round(prices[0]),
        count:  1,
      };
    }

    return new Response(JSON.stringify({
      query,
      priceRange,   // null if no prices found
      sources,      // up to 10 results with extracted prices
      totalResults: items.length,
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
