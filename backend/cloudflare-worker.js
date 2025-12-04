export default {
  async fetch(request, env) {
    // Preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Range',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    const url = new URL(request.url);
    const parts = url.pathname.split('/').filter(Boolean);

    if (parts.length === 0) {
      return new Response('Usage: /bucket/file', { status: 400 });
    }

    const bucket = parts[0];
    const filename = parts.slice(1).join('/');

    const supabaseUrl = env.SUPABASE_URL;
    if (!supabaseUrl) return new Response("Missing SUPABASE_URL", { status: 500 });

    const target = `${supabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;

    const upstream = await fetch(target, {
      headers: {
        'Range': request.headers.get('Range') ?? undefined,
      },
    });

    const headers = new Headers(upstream.headers);

    // CORS
    headers.set('Access-Control-Allow-Origin', '*');
    headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

    // Cache
    if (filename.match(/\.(mp3|m4a|ogg|wav|webm)$/i)) {
      headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      headers.set('Cache-Control', 'public, max-age=3600');
    }

    headers.set('X-Content-Type-Options', 'nosniff');

    return new Response(upstream.body, {
      status: upstream.status,
      headers,
    });
  },
};
