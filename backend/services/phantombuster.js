/**
 * PhantomBuster service
 * Handles: launch → poll → fetch output for any phantom
 */

const PB_BASE = 'https://api.phantombuster.com/api/v2';
const POLL_INTERVAL_MS = 8000;  // 8 seconds
const MAX_WAIT_MS = 300000;     // 5 minutes max

function pbHeaders(apiKey) {
  return {
    'X-Phantombuster-Key': apiKey,
    'Content-Type': 'application/json',
  };
}

// ── Launch a phantom ───────────────────────────────────────────────────
export async function launchPhantom(apiKey, agentId, argument) {
  const res = await fetch(`${PB_BASE}/agents/launch`, {
    method: 'POST',
    headers: pbHeaders(apiKey),
    body: JSON.stringify({ id: agentId, argument }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`PB launch failed: ${err}`);
  }

  const data = await res.json();
  if (!data.containerId) throw new Error('PB launch: no containerId returned');
  return data.containerId;
}

// ── Poll until finished ────────────────────────────────────────────────
export async function pollUntilDone(apiKey, containerId) {
  const start = Date.now();

  while (Date.now() - start < MAX_WAIT_MS) {
    const res = await fetch(
      `${PB_BASE}/containers/fetch?id=${containerId}`,
      { headers: pbHeaders(apiKey) }
    );

    if (!res.ok) throw new Error(`PB poll failed: ${await res.text()}`);

    const data = await res.json();
    const status = data.status;

    if (status === 'finished' && data.exitCode === 0) return true;

    if (status === 'finished' && data.exitCode !== 0) {
      // Fetch output to see the actual error
      const outputRes = await fetch(
        `${PB_BASE}/containers/fetch-output?id=${containerId}`,
        { headers: pbHeaders(apiKey) }
      );
      const outputData = await outputRes.json();
      console.log(`[PB] Failed output:\n${outputData.output}`);
      throw new Error(`Phantom failed with exitCode ${data.exitCode}`);
    }

    if (status === 'error' || status === 'stopped') {
      throw new Error(`Phantom ended with status: ${status}`);
    }

    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));
  }

  throw new Error('Phantom timed out after 5 minutes');
}

// ── Fetch output logs (contains S3 JSON URL) ───────────────────────────
export async function fetchOutput(apiKey, containerId) {
  const res = await fetch(
    `${PB_BASE}/containers/fetch-output?id=${containerId}`,
    { headers: pbHeaders(apiKey) }
  );

  if (!res.ok) throw new Error(`PB fetch-output failed: ${await res.text()}`);
  
  const text = await res.text();
  if (!text || text.trim() === '') return '';

  try {
    const data = JSON.parse(text);
    return data.output || '';
  } catch {
    return '';
  }
}

// ── Parse S3 JSON URL from output logs ────────────────────────────────
export function parseJsonUrl(output, agentId) {
  if (!output) throw new Error('Phantom returned empty output');

  // Check if phantom skipped due to cache
  if (output.includes('All leads have been processed')) {
    // Return null — caller will use agent's existing result file
    return null;
  }

  const jsonMatch = output.match(
    /https:\/\/phantombuster\.s3\.amazonaws\.com\/[^\s\r\n]+\.json/
  );
  if (jsonMatch) return jsonMatch[0];

  const csvMatch = output.match(
    /https:\/\/phantombuster\.s3\.amazonaws\.com\/[^\s\r\n]+\.csv/
  );
  if (csvMatch) return csvMatch[0].replace('.csv', '.json');

  throw new Error(`Could not find result URL in phantom output. Output was:\n${output.substring(0, 500)}`);
}

// ── Fetch last result file from agent directly ─────────────────────
export async function fetchLastResult(apiKey, agentId, profileUrl) {
  const res = await fetch(
    `${PB_BASE}/agents/fetch?id=${agentId}`,
    { headers: pbHeaders(apiKey) }
  );
  if (!res.ok) throw new Error(`Could not fetch agent info: ${await res.text()}`);
  const data = await res.json();

  const s3Folder = data.orgS3Folder;
  const agentFolder = data.s3Folder;
  const csvName = data.argument
    ? JSON.parse(data.argument).csvName || 'result'
    : 'result';

  if (!s3Folder || !agentFolder) throw new Error('Could not find S3 folder info on agent');

  const jsonUrl = `https://phantombuster.s3.amazonaws.com/${s3Folder}/${agentFolder}/${csvName}.json`;
  console.log(`[PB] Using cached result URL: ${jsonUrl}`);

  // Download and verify it actually contains the right profile
  const result = await downloadResult(jsonUrl);
  const rows = Array.isArray(result) ? result : [result];

  // Check if any row matches the requested profileUrl
  const matched = rows.filter(row => {
    const rowUrl = (row.profileUrl || row.linkedinProfileUrl || '').toLowerCase().replace(/\/$/, '');
    const requested = profileUrl.toLowerCase().replace(/\/$/, '');
    return rowUrl.includes(requested) || requested.includes(rowUrl);
  });

  if (matched.length === 0) {
    console.log(`[PB] Cached result is for a different profile — skipping profile data`);
    return []; // ← return empty, summary will use activity data only
  }

  console.log(`[PB] Cached result verified for ${profileUrl}`);
  return rows;
}

// ── Download JSON result from S3 ──────────────────────────────────────
export async function downloadResult(jsonUrl) {
  const res = await fetch(jsonUrl);
  if (!res.ok) throw new Error(`S3 download failed: ${res.status}`);
  
  const text = await res.text();
  if (!text || text.trim() === '') throw new Error('S3 returned empty result file');
  
  try {
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [data];
  } catch (err) {
    throw new Error(`Failed to parse result JSON: ${text.substring(0, 200)}`);
  }
}

// ── Clear agent's previous output before launching ─────────────────────
async function clearAgentOutput(apiKey, agentId) {
  try {
    await fetch(`${PB_BASE}/agents/delete-output?id=${agentId}`, {
      method: 'DELETE',
      headers: pbHeaders(apiKey),
    });
    console.log(`[PB] Cleared previous output for agent ${agentId}`);
  } catch {
    // Not critical — continue even if this fails
    console.log(`[PB] Could not clear output for agent ${agentId}`);
  }
}

// ── Full flow ──────────────────────────────────────────────────────────
export async function runPhantom(apiKey, agentId, argument) {
  // Clear old output first so we always get fresh results
  await clearAgentOutput(apiKey, agentId);

  const containerId = await launchPhantom(apiKey, agentId, argument);
  console.log(`[PB] Launched containerId: ${containerId}`);

  await pollUntilDone(apiKey, containerId);
  console.log(`[PB] Finished containerId: ${containerId}`);

  const output = await fetchOutput(apiKey, containerId);
  console.log(`[PB] Full output:\n${output}`);

  let jsonUrl = parseJsonUrl(output);

  if (!jsonUrl) {
    console.log(`[PB] Phantom used cache — verifying last result matches ${argument.spreadsheetUrl}`);
    return await fetchLastResult(apiKey, agentId, argument.spreadsheetUrl);
  }

  console.log(`[PB] JSON URL: ${jsonUrl}`);
  const result = await downloadResult(jsonUrl);
  return Array.isArray(result) ? result : [result];
}
