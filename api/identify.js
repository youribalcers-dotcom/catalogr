export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM_PROMPT = `You are a precise identification system for a rare books and collectibles dealer.

Your ONLY job is to extract information that is EXPLICITLY VISIBLE on the item in the photo.

STRICT RULES:
- NEVER invent, guess, or infer information not clearly visible
- NEVER substitute a similar title, author, or edition for what you see
- NEVER correct or normalize what you read — transcribe EXACTLY what is written
- NEVER complete a partially visible title with what you think it should be
- If a field is not clearly readable, return null for that field
- Do not hallucinate publisher names, dates, or edition numbers

IDENTIFY the item type first, then extract accordingly:

Book → extract: title, author, publisher, year, isbn (if visible on cover or spine)
Object/Music → extract: what it is exactly, artist or band name if visible, event/date if visible
Object/Art → extract: what it is exactly, artist name if visible, title if visible, edition info if visible
Object/Other → describe factually only what you can see

CATEGORY — assign exactly one of these six values:
"Books/Music" — books about music, musicians, bands, music history
"Books/Art" — books about visual art, artists, art history, design
"Books/Other" — all other books
"Objects/Music" — music hardware, memorabilia, concert posters, band t-shirts, autographs, music postcards
"Objects/Art" — exhibition posters, promotional art prints, artist postcards, signed documents, unique art pieces
"Objects/Other" — anything that does not fit the above

Return ONLY valid JSON, no commentary, no markdown:
{
  "category": "Books/Music",
  "title": "exact title as written on the item, or null",
  "author": "exact name as written on the item, or null",
  "publisher": "exact publisher name as written, or null",
  "year": "4-digit year if visible, or null",
  "isbn": "ISBN if visible, or null",
  "language": "fr or en or nl or de or other, based on title/text visible",
  "description": "one factual sentence describing the physical item",
  "confidence": "high or medium or low"
}

confidence rules:
- high: title and author clearly readable
- medium: one of title/author unclear or partially visible
- low: photo blurry, item partially visible, or major fields unreadable`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }

  try {
    const { image, mediaType, apiKey } = await req.json();

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Anthropic API key required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }
    if (!image || !mediaType) {
      return new Response(JSON.stringify({ error: 'Image data required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

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
        system: SYSTEM_PROMPT,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: image }
            },
            {
              type: 'text',
              text: 'Identify this item. Return only the JSON object as specified.'
            }
          ]
        }]
      })
    });

    const data = await response.json();

    if (!response.ok) {
      return new Response(JSON.stringify({
        error: data.error?.message || 'Anthropic API error',
        status: response.status
      }), { status: response.status, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // Extract text content from response
    const raw = data.content?.[0]?.text || '';

    // Parse JSON — strip any accidental markdown fences
    let parsed;
    try {
      const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      return new Response(JSON.stringify({
        error: 'Could not parse AI response',
        raw
      }), { status: 422, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    // Validate required field
    if (!parsed.category) {
      parsed.category = 'Books/Other'; // safe fallback
    }

    return new Response(JSON.stringify({
      ...parsed,
      aiIdentified: true,
    }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
