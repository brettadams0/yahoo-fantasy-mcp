import readline from 'node:readline/promises';
import { mkdir, writeFile } from 'node:fs/promises';
import { loadClientSecret, CREDENTIALS_DIR, TOKEN_PATH, AUTH_ENDPOINT, TOKEN_ENDPOINT, REDIRECT_URI } from '../src/auth.js';

async function main() {
  const { client_id, client_secret } = await loadClientSecret();

  const authUrl = new URL(AUTH_ENDPOINT);
  authUrl.searchParams.set('client_id', client_id);
  authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('language', 'en-us');

  console.log('\nOpen this URL and sign in / approve with the Yahoo account you want the server to use:\n');
  console.log(authUrl.toString());
  console.log('\nYahoo will show a verification code on-screen (out-of-band redirect) — paste it below.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = (await rl.question('Verification code: ')).trim();
  rl.close();

  const tokenRes = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${client_id}:${client_secret}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ grant_type: 'authorization_code', redirect_uri: REDIRECT_URI, code }),
  });
  if (!tokenRes.ok) {
    throw new Error(`Token exchange failed: ${tokenRes.status} ${await tokenRes.text()}`);
  }
  const data = await tokenRes.json();

  await mkdir(CREDENTIALS_DIR, { recursive: true });
  await writeFile(
    TOKEN_PATH,
    JSON.stringify(
      { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Date.now() + data.expires_in * 1000 },
      null,
      2
    )
  );
  console.log(`Saved token to ${TOKEN_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
