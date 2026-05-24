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
    const { query, appId } = await req.json();
    if (!query || !appId) {
      return new Response(JSON.stringify({ error: 'Missing query or appId' }), { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }

    const encodedQuery = encodeURIComponent(query);
    const url = `https://svcs.ebay.com/services/search/FindingService/v1?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.0.0&SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodedQuery}&categoryId=267&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&paginationInput.entriesPerPage=10&sortOrder=EndTimeSoonest`;

    const r = await fetch(url);
    const d = await r.json();

    const items = d?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    const count = parseInt(d?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.['@count'] || '0');

    const prices = items
      .map(i => parseFloat(i?.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['__value__'] || '0'))
      .filter(p => p > 0);

    const avgPrice = prices.length > 0 ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : null;
    const minPrice = prices.length > 0 ? Math.round(Math.min(...prices)) : null;
    const maxPrice = prices.length > 0 ? Math.round(Math.max(...prices)) : null;

    return new Response(JSON.stringify({ count, avgPrice, minPrice, maxPrice, items: items.slice(0, 3).map(i => ({
      title: i.title?.[0] || '',
      price: parseFloat(i.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['__value__'] || '0'),
      url: i.viewItemURL?.[0] || ''
    })) }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, count: 0 }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
