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

    // Submit transcription job
    const submitRes = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        'Authorization': assemblyKey,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        audio_url: audioUrl,
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
