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
    const { image, mediaType, apiKey } = await req.json();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            {
              type: 'text',
              text: `You are an expert antiquarian bookseller. Identify this book precisely.

Return ONLY valid JSON, no markdown:
{
  "title": "exact title",
  "author": "full author name",
  "publisher": "publisher name",
  "year": "4-digit year of THIS edition",
  "isbn": "ISBN-13 if visible, else empty string",
  "language": "en or fr or nl",
  "pages": "page count or empty string",
  "description": "one sentence",
  "editionNote": "CRITICAL: specify if this is original first edition, reprint, reissue, facsimile, or which numbered edition. E.g. 'Original first edition 1964', 'Folio Society reissue 2003', '3rd reprint'. Leave empty if unknown.",
  "marketLow": <integer EUR low estimate for THIS specific edition>,
  "marketHigh": <integer EUR high estimate for THIS specific edition>,
  "identified": true
}

PRICING RULES — be precise and conservative for THIS edition:
- A reprint/reissue of a classic (Folio, Gallimard, Penguin): low=5, high=15
- Standard used paperback: low=5, high=20
- Standard used hardcover: low=10, high=30
- Specialized or out-of-print: low=20, high=60
- Genuine first edition of important work: low=50, high=200
- Rare first edition, signed, or unique: low=100, high=500+

The difference between an original Bruno Munari Xerografia (1964, ~2000€) and its reissue (2013, ~50€) is enormous.
Always try to determine which edition this is from the cover, spine, and any visible text.

If you cannot identify: {"identified": false}`
            }
          ]
        }]
      })
    });
    const data = await response.json();
    return new Response(JSON.stringify(data), {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: e.message } }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
    });
  }
}
