/**
 * Netlify Function — Lyrics proxy (Musixmatch)
 * Avoids CORS by proxying from serverless function.
 * Deploy: automatically picked up when you deploy to Netlify.
 *
 * Usage: GET /.netlify/functions/lyrics?title=Shape+of+You&artist=Ed+Sheeran
 *
 * Setup:
 *   1. Go to https://developer.musixmatch.com → get free API key
 *   2. In Netlify Dashboard → Site → Environment Variables
 *      Add: MUSIXMATCH_KEY = your_key_here
 */
exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json',
  };

  const { title, artist } = event.queryStringParameters || {};
  if (!title) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing title param' }) };
  }

  const apiKey = process.env.MUSIXMATCH_KEY;
  if (!apiKey) {
    return { statusCode: 503, headers, body: JSON.stringify({ error: 'MUSIXMATCH_KEY not configured' }) };
  }

  try {
    // Step 1: search for the track
    const searchUrl = `https://api.musixmatch.com/ws/1.1/track.search?` +
      new URLSearchParams({
        q_track: title, q_artist: artist || '',
        page_size: 1, page: 1,
        s_track_rating: 'desc',
        apikey: apiKey,
      });

    const searchRes  = await fetch(searchUrl);
    const searchData = await searchRes.json();
    const track      = searchData?.message?.body?.track_list?.[0]?.track;

    if (!track) {
      return { statusCode: 404, headers, body: JSON.stringify({ error: 'Track not found' }) };
    }

    // Step 2: fetch lyrics
    const lyricsUrl = `https://api.musixmatch.com/ws/1.1/track.lyrics.get?` +
      new URLSearchParams({ track_id: track.track_id, apikey: apiKey });

    const lyricsRes  = await fetch(lyricsUrl);
    const lyricsData = await lyricsRes.json();
    const lyricsBody = lyricsData?.message?.body?.lyrics?.lyrics_body || '';

    // Musixmatch free tier returns partial lyrics
    const lyrics = lyricsBody.replace(/\*{7}.*$/s, '').trim();

    return {
      statusCode: 200, headers,
      body: JSON.stringify({
        lyrics,
        track_name:   track.track_name,
        artist_name:  track.artist_name,
        has_subtitles: track.has_subtitles === 1,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
