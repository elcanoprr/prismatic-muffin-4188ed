exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  try {
    const { assemblyKey, audioUrl } = JSON.parse(event.body);

    // First download the audio from Instagram via server-side fetch
    // (Instagram URLs expire and block client-side access)
    let finalAudioUrl = audioUrl;
    try {
      const audioRes = await fetch(audioUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
        }
      });
      if (!audioRes.ok) throw new Error('Could not fetch audio');
      const audioBuffer = await audioRes.arrayBuffer();
      const audioBase64 = Buffer.from(audioBuffer).toString('base64');
      
      // Upload to AssemblyAI first
      const uploadRes = await fetch('https://api.assemblyai.com/v2/upload', {
        method: 'POST',
        headers: {
          'Authorization': assemblyKey,
          'Content-Type': 'application/octet-stream'
        },
        body: Buffer.from(audioBuffer)
      });
      const uploadData = await uploadRes.json();
      if (uploadData.upload_url) finalAudioUrl = uploadData.upload_url;
    } catch(e) {
      // If download fails, try direct URL anyway
      console.log('Direct download failed, trying URL directly:', e.message);
    }

    // Submit transcription job
    const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': assemblyKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audio_url: finalAudioUrl,
        language_code: 'es',
        punctuate: true,
        format_text: true
      })
    });

    const submitData = await submitRes.json();
    if (!submitData.id) throw new Error('No se pudo iniciar la transcripción');

    const transcriptId = submitData.id;

    // Poll until complete (max 60 seconds)
    let attempts = 0;
    while (attempts < 20) {
      await new Promise(r => setTimeout(r, 3000));
      const pollRes = await fetch(`https://api.assemblyai.com/v2/transcript/${transcriptId}`, {
        headers: { 'Authorization': assemblyKey }
      });
      const pollData = await pollRes.json();

      if (pollData.status === 'completed') {
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ text: pollData.text, words: pollData.words })
        };
      }
      if (pollData.status === 'error') {
        throw new Error('Error en transcripción: ' + pollData.error);
      }
      attempts++;
    }

    throw new Error('Transcripción tardó demasiado');
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err.message })
    };
  }
};
