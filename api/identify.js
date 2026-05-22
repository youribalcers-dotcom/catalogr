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
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: image }
            },
            {
              type: 'text',
              text: `You are a book identification and rare book market expert. Look at this image and identify the book.

Return ONLY a valid JSON object, no markdown, no explanation:
{
  "title": "exact book title",
  "author": "author full name",
  "publisher": "publisher name",
  "year": "publication year as 4-digit string",
  "isbn": "ISBN-13 if visible, otherwise empty string",
  "language": "en or fr or nl",
  "pages": "page count as string if known, otherwise empty string",
  "description": "one sentence about this book",
  "marketEstimate": "realistic second-hand price in EUR as integer. Common paperbacks 5-15, standard used 10-30, genuinely rare out-of-print 50-200, exceptional first editions 200+. A Folio or Gallimard reprint of a classic is worth 8-15 used. Do not inflate.",
  "identified": true
}

If you cannot identify the book at all, return: {"identified": false}`
            }
          ]
        }]
      })
    });

    const data = await response.json();

    return new Response(JSON.stringify(data), {
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: { message: e.message } }), {
      status: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      }
    });
  }
}