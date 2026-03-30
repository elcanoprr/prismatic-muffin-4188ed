const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  const headers = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };

  const apifyKey = process.env.APIFY_KEY;
  const usernamesEnv = process.env.INSTAGRAM_USERNAMES || '';
  const usernames = usernamesEnv.split(',').map(s => s.trim().replace('@', '')).filter(Boolean);

  if (!apifyKey || usernames.length === 0) {
    console.log('[scheduled-pipeline] Skipped: missing APIFY_KEY or INSTAGRAM_USERNAMES env vars');
    return { statusCode: 200, headers, body: JSON.stringify({ skipped: true, reason: 'missing env vars' }) };
  }

  try {
    console.log('[scheduled-pipeline] Starting Apify run for:', usernames);
    const runRes = await fetch(
      'https://api.apify.com/v2/acts/apify~instagram-scraper/runs?token=' + apifyKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          directUrls: usernames.map(u => 'https://www.instagram.com/' + u + '/'),
          resultsType: 'posts',
          resultsLimit: 10,
          addParentData: false
        })
      }
    );
    const runData = await runRes.json();
    const runId = runData.data && runData.data.id;
    if (!runId) throw new Error('Apify: no runId - ' + JSON.stringify(runData).substring(0, 200));
    console.log('[scheduled-pipeline] Apify runId:', runId);

    let videos = [];
    for (let i = 0; i < 54; i++) {
      await new Promise(r => setTimeout(r, 10000));
      const sr = await fetch('https://api.apify.com/v2/actor-runs/' + runId + '?token=' + apifyKey);
      const sd = await sr.json();
      const status = sd.data && sd.data.status;
      console.log('[scheduled-pipeline] Poll ' + (i + 1) + ': ' + status);

      if (status === 'SUCCEEDED') {
        const dsId = sd.data.defaultDatasetId;
        const ir = await fetch('https://api.apify.com/v2/datasets/' + dsId + '/items?format=json&limit=50&token=' + apifyKey);
        videos = await ir.json();
        break;
      }
      if (status === 'FAILED' || status === 'ABORTED' || status === 'TIMED-OUT') {
        throw new Error('Apify run ended with: ' + status);
      }
    }

    const runAt = new Date().toISOString();
    const result = { videos: videos, runAt: runAt, usernames: usernames, count: videos.length };

    if (videos.length > 0) {
      const store = getStore('virality-system');
      await store.setJSON('latest_pipeline', result);
      console.log('[scheduled-pipeline] Stored', videos.length, 'videos in Blob');
    }

    return { statusCode: 200, headers, body: JSON.stringify({ ok: true, count: videos.length, runAt: runAt }) };
  } catch (err) {
    console.error('[scheduled-pipeline] Error:', err.message);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message }) };
  }
};
