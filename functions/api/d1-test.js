const CACHE_SECONDS = 60;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': `public, max-age=${CACHE_SECONDS}`,
    },
  });
}

export async function onRequestGet({ env }) {
  try {
    if (!env.DB) {
      return json({ error: 'D1 binding DB is missing' }, 500);
    }

    const result = await env.DB
      .prepare('SELECT * FROM songs ORDER BY id DESC LIMIT 10')
      .all();

    return json({
      source: 'd1',
      songs: result.results,
    });
  } catch (error) {
    return json({ error: error.message || String(error) }, 500);
  }
}
