exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const { assemblyKey, audioUrl, apifyKey } = JSON.parse(event.body);
    if (!assemblyKey) throw new Error('Falta AssemblyAI key');
    if (!audioUrl) throw new Error('Falta audioUrl');
    let uploadUrl = audioUrl;
    try {
      const fh = {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15',
        'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-US,es;q=0.9',
        'Referer': 'https://www.instagram.com/',
        'Origin': 'https://www.instagram.com',
      };
      if (apifyKey && (audioUrl.includes('apify.com') || audioUrl.includes('apifyusercontent.com'))) {
        fh['Authorization'] = 'Bearer ' + apifyKey;
      }
      const ctrl = new AbortController();
      const tid = setTimeout(() => ctrl.abort(), 7000);
      const ar = await fetch(audioUrl, { headers: fh, signal: ctrl.signal });
      clearTimeout(tid);
      if (!ar.ok) throw new Error('HTTP ' + ar.status);
      const buf = await ar.arrayBuffer();
      if (buf.byteLength === 0) throw new Error('Audio vacio');
      const up = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: { 'Authorization': assemblyKey, 'Content-Type': 'application/octet-stream' },
        body: Buffer.from(buf)
      });
      const ud = await up.json();
      if (ud.upload_url) uploadUrl = ud.upload_url;
      else throw new Error('No upload_url: ' + JSON.stringify(ud));
    } catch (e) {
      console.log('Download/upload fallido, usando URL directa:', e.message);
    }
    const sr = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: { 'Authorization': assemblyKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ audio_url: uploadUrl, language_code: 'es', punctuate: true, format_text: true })
    });
    const sd = await sr.json();
    if (!sd.id) throw new Error('No transcriptId: ' + (sd.error || JSON.stringify(sd)));
    return { statusCode: 200, headers, body: JSON.stringify({ transcriptId: sd.id, status: 'queued', usedDirectUrl: uploadUrl === audioUrl }) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
