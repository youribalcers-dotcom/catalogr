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
      return new Response(JSON.stringify({ error: 'Missing query or appId' }), {
        status: 400,
        headers: { 'Access-Control-Allow-Origin': '*' }
      });
    }

    const encodedQuery = encodeURIComponent(query);
    const baseUrl = 'https://svcs.ebay.com/services/search/FindingService/v1';
    const commonParams = `SECURITY-APPNAME=${appId}&RESPONSE-DATA-FORMAT=JSON&REST-PAYLOAD&keywords=${encodedQuery}&categoryId=267&paginationInput.entriesPerPage=10`;

    // Fetch sold + active in parallel
    const [soldRes, activeRes] = await Promise.all([
      fetch(`${baseUrl}?OPERATION-NAME=findCompletedItems&SERVICE-VERSION=1.0.0&${commonParams}&itemFilter(0).name=SoldItemsOnly&itemFilter(0).value=true&sortOrder=EndTimeSoonest`),
      fetch(`${baseUrl}?OPERATION-NAME=findItemsAdvanced&SERVICE-VERSION=1.0.0&${commonParams}&sortOrder=PricePlusShippingLowest`)
    ]);

    const [soldData, activeData] = await Promise.all([soldRes.json(), activeRes.json()]);

    // Process sold
    const soldItems = soldData?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.item || [];
    const soldCount = parseInt(soldData?.findCompletedItemsResponse?.[0]?.searchResult?.[0]?.['@count'] || '0');
    const soldPrices = soldItems.map(i => parseFloat(i?.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['__value__'] || '0')).filter(p => p > 0);
    const soldAvg = soldPrices.length > 0 ? Math.round(soldPrices.reduce((a, b) => a + b, 0) / soldPrices.length) : null;
    const soldMin = soldPrices.length > 0 ? Math.round(Math.min(...soldPrices)) : null;
    const soldMax = soldPrices.length > 0 ? Math.round(Math.max(...soldPrices)) : null;

    // Process active
    const activeItems = activeData?.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.item || [];
    const activeCount = parseInt(activeData?.findItemsAdvancedResponse?.[0]?.searchResult?.[0]?.['@count'] || '0');
    const activePrices = activeItems.map(i => parseFloat(i?.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['__value__'] || '0')).filter(p => p > 0);
    const activeMin = activePrices.length > 0 ? Math.round(Math.min(...activePrices)) : null;
    const activeMax = activePrices.length > 0 ? Math.round(Math.max(...activePrices)) : null;

    return new Response(JSON.stringify({
      sold: {
        count: soldCount,
        avgPrice: soldAvg,
        minPrice: soldMin,
        maxPrice: soldMax,
        items: soldItems.slice(0, 3).map(i => ({
          title: i.title?.[0] || '',
          price: parseFloat(i.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['__value__'] || '0'),
          url: i.viewItemURL?.[0] || ''
        }))
      },
      active: {
        count: activeCount,
        minPrice: activeMin,
        maxPrice: activeMax,
        items: activeItems.slice(0, 3).map(i => ({
          title: i.title?.[0] || '',
          price: parseFloat(i.sellingStatus?.[0]?.convertedCurrentPrice?.[0]?.['__value__'] || '0'),
          url: i.viewItemURL?.[0] || ''
        }))
      }
    }), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message, sold: { count: 0 }, active: { count: 0 } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
