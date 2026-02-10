const { run } = require('./runner');

function parseArgs(argv) {
  const out = {};
  for (const arg of argv) {
    if (!arg.startsWith('--')) continue;
    const eq = arg.indexOf('=');
    if (eq === -1) {
      out[arg.slice(2)] = true;
    } else {
      const key = arg.slice(2, eq);
      const val = arg.slice(eq + 1);
      out[key] = val;
    }
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const runId = args.runId;
  const preMigrationUrl = args.preMigrationUrl;
  const postMigrationUrl = args.postMigrationUrl;

  if (!runId || !preMigrationUrl || !postMigrationUrl) {
    console.error(
      'Missing required args. Usage: node src/index.js --runId=... --preMigrationUrl=... --postMigrationUrl=...'
    );
    process.exit(2);
  }

  await run({ runId, preMigrationUrl, postMigrationUrl });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

