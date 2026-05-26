export const config = { runtime: 'edge' };

const KV_URL   = process.env.KV_REST_API_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default async function handler(req) {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });

  try {
    const { action, userId, data } = await req.json();
    const key = `user:${userId}`;

    if (action === 'get') {
      const res = await fetch(`${KV_URL}/get/${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
      const json = await res.json();
      const parsed = json.result ? JSON.parse(json.result) : { stock: [], history: [] };
      return new Response(JSON.stringify({ data: parsed }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    if (action === 'set') {
      // Send value in request body to avoid URL length limits
      const res = await fetch(`${KV_URL}/set/${encodeURIComponent(key)}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${KV_TOKEN}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify([JSON.stringify(data)]),
      });
      const json = await res.json();
      return new Response(JSON.stringify({ ok: json.result === 'OK' }), {
        headers: { 'Content-Type': 'application/json', ...CORS }
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400, headers: { 'Content-Type': 'application/json', ...CORS }
    });

  } catch(e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...CORS }
    });
  }
}
