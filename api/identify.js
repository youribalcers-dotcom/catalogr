export const config = { runtime: 'edge' };

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const SYSTEM_PROMPT = `You are a precise identification system for a rare books and collectibles dealer.

Your ONLY job is to extract information that is EXPLICITLY VISIBLE on the item in the photo.

STEP 1 — DETERMINE IF THIS IS A BOOK OR AN OBJECT:
A BOOK has: a cover (front and/or spine), pages, a title printed on the cover, an author name.
Printed matter of any kind (hardcover, paperback, catalogue, zine, magazine, booklet) = BOOK.
If it looks like it could be a book, classify it as a book.
Only classify as Object if it is clearly NOT printed matter: hardware, clothing, poster, postcard, signed document, electronic device, vinyl record.

STEP 2 — EXTRACT ONLY WHAT IS EXPLICITLY VISIBLE:
- NEVER invent, guess, or infer information not clearly visible
- NEVER substitute a similar title, author, or edition for what you see
- NEVER correct or normalize what you read — transcribe EXACTLY what is written
- NEVER complete a partially visible title with what you think it should be
- If a field is not clearly readable, return null for that field
- Unusual typography, foreign scripts, or strange layouts do not justify substitution — transcribe as-is or return null

STEP 3 — ASSIGN CATEGORY:
Books:
  "Books/Music"   — books about music, musicians, bands, music history, instruments
  "Books/Art"     — books about visual art, artists, art history, design, architecture, photography
  "Books/Other"   — all other books (literature, science, history, etc.)

Objects (only if clearly NOT a book):
  "Objects/Music" — music hardware, pedals, memorabilia, concert posters, band t-shirts, autographs
  "Objects/Art"   — exhibition posters, art prints, artist postcards, signed documents, unique art pieces
  "Objects/Other" — anything else that is not printed matter

Return ONLY valid JSON, no commentary, no markdown:
{
  "category": "Books/Music",
  "title": "exact title as written on the item, or null",
  "author": "exact name as written on the item, or null",
  "publisher": "exact publisher name as written, or null",
  "year": "4-digit year if visible, or null",
  "isbn": "ISBN if visible, or null",
  "language": "fr or en or nl or de or other, based on text visible",
  "description": "one factual sentence describing the physical item",
  "confidence": "high or medium or low"
}

confidence:
- high: title and author clearly readable
- medium: one of title/author unclear or partially visible
- low: photo blurry, item partially visible, or major fields unreadable`;

const CORRECTIONS_PROMPT = `You are a metadata correction assistant for a book and collectibles cataloguing app.

The user has scanned an item and Claude identified it. The user then dictated a voice note with corrections or additional information.

Your job: parse the voice note and return ONLY the fields that need to be corrected or updated.

Rules:
- Only return fields that are explicitly mentioned in the note
- If the note says "correct title: X" or "title is X" or "it's called X" → return title
- If the note says "author is X" or "by X" → return author
- If the note says "it's a book" or "it's an art book" or "music book" → return category
- If the note says "publisher is X" or "published by X" → return publisher
- If the note says "year X" or "from X" → return year
- If the note mentions condition like "few pages damaged" or "signed copy" → return notes (preserve as-is)
- Do NOT return fields not mentioned in the note
- Do NOT invent corrections

Return ONLY valid JSON with the fields to update, for example:
{ "title": "corrected title", "category": "Books/Art" }
Or if nothing to correct: {}`;

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST only' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }

  try {
    const { image, mediaType, apiKey, action, notes, currentData } = await req.json();

    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'Anthropic API key required' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // ── ACTION: parse voice note corrections ──────────────────────────────────
    if (action === 'correct') {
      if (!notes) return new Response(JSON.stringify({}), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });

      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          system: CORRECTIONS_PROMPT,
          messages: [{
            role: 'user',
            content: `Current item data:\n${JSON.stringify(currentData, null, 2)}\n\nVoice note: "${notes}"\n\nReturn only the fields to correct as JSON.`
          }]
        })
      });

      const data = await r.json();
      const raw = data.content?.[0]?.text || '{}';
      try {
        const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        const corrections = JSON.parse(clean);
        return new Response(JSON.stringify(corrections), {
          headers: { 'Content-Type': 'application/json', ...CORS }
        });
      } catch(e) {
        return new Response(JSON.stringify({}), {
          headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
    }

    // ── ACTION: describe (for Shopify push) ───────────────────────────────────
    if (action === 'describe') {
      if (!image || !mediaType) {
        return new Response(JSON.stringify({ error: 'Image required for describe' }), {
          status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
        });
      }
      const r = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: 'claude-haiku-4-5-20251001',
          max_tokens: 300,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
              { type: 'text', text: 'Write a short, compelling product description (2-3 sentences) for this item to sell it online. Focus on condition, notable features, and collectible value. Plain text only.' }
            ]
          }]
        })
      });
      const data = await r.json();
      const txt = data.content?.[0]?.text?.trim() || '';
      return new Response(JSON.stringify({ description: txt }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    // ── ACTION: identify (default) ────────────────────────────────────────────
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
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: image } },
            { type: 'text', text: 'Identify this item. Return only the JSON object as specified.' }
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

    const raw = data.content?.[0]?.text || '';
    let parsed;
    try {
      const clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      parsed = JSON.parse(clean);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Could not parse AI response', raw }),
        { status: 422, headers: { 'Content-Type': 'application/json', ...CORS } });
    }

    if (!parsed.category) parsed.category = 'Books/Other';

    return new Response(JSON.stringify({ ...parsed, aiIdentified: true }), {
      headers: { 'Content-Type': 'application/json', ...CORS }
    });

  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
