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
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            {
              type: 'text',
              text: `You are a book identification expert and second-hand book dealer. Identify this book from the image.

Return ONLY valid JSON, no markdown:
{
  "title": "exact title",
  "author": "full author name",
  "publisher": "publisher name",
  "year": "4-digit year",
  "isbn": "ISBN-13 if visible, else empty string",
  "language": "en or fr or nl",
  "pages": "page count or empty string",
  "description": "one sentence",
  "marketEstimate": <integer EUR, see rules below>,
  "identified": true
}

STRICT PRICING RULES — be conservative, not optimistic:
- Mass market paperback (Folio, Poche, Penguin, etc): 3-12
- Standard used paperback: 5-15
- Standard used hardcover: 8-25
- Academic or specialized book: 15-40
- Out of print but not rare: 20-60
- Genuinely rare, hard to find: 60-150
- Exceptional first edition or signed: 150-400
- Only go above 400 for truly extraordinary items

Most books are in the 5-25 range. Do NOT inflate because an author is famous.
A Folio Celine is worth 8-12. A Penguin classic is worth 5-10.

If you cannot identify the book: {"identified": false}`
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
