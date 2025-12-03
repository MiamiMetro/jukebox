/**
 * Cloudflare Worker for Jukebox CDN
 * 
 * This worker proxies requests to Supabase storage and adds CDN benefits:
 * - Custom domain
 * - Edge caching
 * - CORS headers
 * - Better performance
 * 
 * Deploy this to Cloudflare Workers
 */

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight requests
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
    
    // Extract bucket and filename from path
    // Expected format: https://your-domain.com/jukebox-tracks/song.mp3
    // Or: https://your-domain.com/song.mp3 (if bucket is in env)
    const pathParts = url.pathname.split('/').filter(p => p);
    
    if (pathParts.length === 0) {
      return new Response('Jukebox CDN Worker\n\nUsage: /jukebox-tracks/filename.mp3', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
    
    // Get bucket name from path or environment variable
    let bucket, filename;
    
    if (pathParts.length >= 2) {
      // Format: /jukebox-tracks/song.mp3
      bucket = pathParts[0];
      filename = pathParts.slice(1).join('/');
    } else {
      // Format: /song.mp3 (use bucket from env)
      bucket = env.SUPABASE_BUCKET || 'jukebox-tracks';
      filename = pathParts[0];
    }
    
    // Get Supabase URL from environment
    // Handle cases where the key might have trailing/leading spaces
    let supabaseUrl = env.SUPABASE_URL;
    
    // If not found, try to find it by trimming keys (handles trailing spaces)
    if (!supabaseUrl && env) {
      const envKeys = Object.keys(env);
      for (const key of envKeys) {
        if (key.trim() === 'SUPABASE_URL') {
          supabaseUrl = env[key];
          break;
        }
      }
    }
    
    // Also try alternative names
    if (!supabaseUrl) {
      supabaseUrl = env['SUPABASE_URL '] || env[' SUPABASE_URL'] || env.SUPABASE_URL_PRODUCTION || env.SUPABASE_URL_PREVIEW;
    }
    
    if (!supabaseUrl) {
      // Debug information
      const debugInfo = {
        hasEnv: !!env,
        envKeys: env ? Object.keys(env) : [],
        message: 'SUPABASE_URL not found in environment variables',
        hint: 'Make sure you added SUPABASE_URL in Settings → Variables and redeployed the Worker. Also check for trailing spaces in the variable name.'
      };
      
      return new Response(JSON.stringify(debugInfo, null, 2), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        },
      });
    }
    
    // Construct Supabase storage URL
    const supabasePublicUrl = `${supabaseUrl}/storage/v1/object/public/${bucket}/${filename}`;
    
    // Create a new request to Supabase
    const supabaseRequest = new Request(supabasePublicUrl, {
      method: request.method,
      headers: {
        // Forward Range header for audio streaming (seek support)
        'Range': request.headers.get('Range') || '',
      },
    });
    
    try {
      // Fetch from Supabase
      const response = await fetch(supabaseRequest);
      
      // If Supabase returns an error, pass it through
      if (!response.ok && response.status !== 206) { // 206 is Partial Content (for Range requests)
        return new Response(
          `Failed to fetch from Supabase: ${response.status} ${response.statusText}`,
          { status: response.status }
        );
      }
      
      // Clone response to modify headers
      const newResponse = new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
      
      // Add CORS headers
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      newResponse.headers.set('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
      
      // Set cache headers for better performance
      // Cache audio files for 1 year (they're immutable)
      if (filename.match(/\.(mp3|m4a|ogg|wav|webm)$/i)) {
        newResponse.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      } else {
        // Cache other files for 1 hour
        newResponse.headers.set('Cache-Control', 'public, max-age=3600');
      }
      
      // Add security headers
      newResponse.headers.set('X-Content-Type-Options', 'nosniff');
      
      // Forward important headers from Supabase
      const contentType = response.headers.get('Content-Type');
      if (contentType) {
        newResponse.headers.set('Content-Type', contentType);
      }
      
      const contentLength = response.headers.get('Content-Length');
      if (contentLength) {
        newResponse.headers.set('Content-Length', contentLength);
      }
      
      // Forward Range response headers for audio streaming
      const contentRange = response.headers.get('Content-Range');
      if (contentRange) {
        newResponse.headers.set('Content-Range', contentRange);
      }
      
      const acceptRanges = response.headers.get('Accept-Ranges');
      if (acceptRanges) {
        newResponse.headers.set('Accept-Ranges', acceptRanges);
      }
      
      return newResponse;
      
    } catch (error) {
      return new Response(`Error fetching from Supabase: ${error.message}`, {
        status: 500,
        headers: { 'Content-Type': 'text/plain' },
      });
    }
  },
};

