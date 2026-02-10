const fs = require('fs');
const path = require('path');

function fileExists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function countNetworkFromDir(dir) {
  // We write session-final-network.json; count entries if present
  const candidates = [
    path.join(dir, 'session-final-network.json'),
    path.join(dir, 'session-network.json')
  ];
  for (const p of candidates) {
    if (!fileExists(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, 'utf-8'));
      if (data && Array.isArray(data.requests)) return data.requests.length;
      if (data && typeof data.count === 'number') return data.count;
    } catch {
      // ignore
    }
  }
  return 0;
}

function compareRuns({ steps, preRun, postRun }) {
  const preNetworkCount = countNetworkFromDir(preRun.outDir);
  const postNetworkCount = countNetworkFromDir(postRun.outDir);

  const stepResults = steps.map((instruction, idx) => {
    const stepNumber = idx + 1;

    const pre = preRun.steps[idx];
    const post = postRun.steps[idx];

    const preShotOk = pre && fileExists(pre.screenshotPath);
    const postShotOk = post && fileExists(post.screenshotPath);

    const ok = Boolean(pre && post && pre.ok && post.ok && preShotOk && postShotOk);
    const status = ok ? 'PASS' : 'FAIL';

    const aiComment = ok
      ? `Step ${stepNumber} executed successfully on both versions. Network calls pre=${preNetworkCount}, post=${postNetworkCount}.`
      : `Step ${stepNumber} mismatch. preOk=${pre ? pre.ok : false}, postOk=${post ? post.ok : false}, preShot=${preShotOk}, postShot=${postShotOk}.`;

    return {
      stepNumber,
      status,
      preScreenshotPath: pre ? pre.screenshotPath : '',
      postScreenshotPath: post ? post.screenshotPath : '',
      aiComment,
      preNetworkCount,
      postNetworkCount,
      failureReason: (pre && pre.failureReason) || (post && post.failureReason) || null
    };
  });

  return { stepResults };
}

module.exports = { compareRuns };

