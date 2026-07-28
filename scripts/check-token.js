import { yahooFetch } from '../src/auth.js';

async function main() {
  const data = await yahooFetch('/users;use_login=1/games');
  console.log('OK: token valid, fetched games list');
  console.log(JSON.stringify(data, null, 2).slice(0, 500));
}

main().catch((err) => {
  console.error(`EXPIRED_OR_MISSING: ${err.message}`);
  process.exit(1);
});
