exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  try {
    const { assemblyKey, transcriptId } = JSON.parse(event.body);
    if (!assemblyKey) throw new Error('Falta AssemblyAI key');
    if (!transcriptId) throw new Error('Falta transcriptId');
    const res = await fetch('https://api.assemblyai.com/v2/transcript/' + transcriptId, {
      headers: { 'Authorization': assemblyKey }
    });
    const data = await res.json();
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        status: data.status,
        text: data.text || null,
        error: data.error || null,
        words: data.words || null
      })
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
