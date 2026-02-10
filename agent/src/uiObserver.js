const path = require('path');
const fs = require('fs');

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function createUiObserver({ outDir }) {
  let requests = [];
  let attached = false;
  let onRequest = null;
  let onResponse = null;

  function snapshotNetwork() {
    return {
      count: requests.length,
      requests: requests.slice()
    };
  }

  async function flushNetworkToDisk(prefix) {
    ensureDir(outDir);
    const p = path.join(outDir, `${prefix}-network.json`);
    fs.writeFileSync(p, JSON.stringify(snapshotNetwork(), null, 2), 'utf-8');
    return p;
  }

  return {
    attach: async (page) => {
      if (attached) return;
      attached = true;
      requests = [];

      onRequest = (req) => {
        requests.push({
          url: req.url(),
          method: req.method(),
          resourceType: req.resourceType(),
          timestamp: Date.now()
        });
      };

      onResponse = (res) => {
        // store response metadata (best-effort)
        try {
          const req = res.request();
          requests.push({
            url: req.url(),
            method: req.method(),
            resourceType: req.resourceType(),
            status: res.status(),
            timestamp: Date.now()
          });
        } catch {
          // ignore
        }
      };

      page.on('request', onRequest);
      page.on('response', onResponse);

      // periodic checkpoint for debugging (not step-granular)
      await flushNetworkToDisk('session');
    },
    detach: async () => {
      // nothing to detach without page reference (runner handles fresh pages per phase)
      await flushNetworkToDisk('session-final');
    },
    snapshotNetwork,
    flushNetworkToDisk
  };
}

module.exports = { createUiObserver };

