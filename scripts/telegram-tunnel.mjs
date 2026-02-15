#!/usr/bin/env node
/**
 * Start the API with PUBLIC_API_URL set from an already-running ngrok tunnel.
 * Use this to test Telegram webhook locally.
 *
 * Terminal 1: npm run tunnel     (starts ngrok http 3000)
 * Terminal 2: npm run dev:telegram   (this script: reads ngrok URL, starts API with PUBLIC_API_URL)
 */

const http = require('http');
const { spawn } = require('child_process');

const NGROK_API = 'http://127.0.0.1:4040/api/tunnels';
const API_PORT = process.env.PORT || 3000;

function fetchNgrokUrl() {
  return new Promise((resolve, reject) => {
    const req = http.get(NGROK_API, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          const tunnels = json.tunnels || [];
          const https = tunnels.find((t) => t.public_url.startsWith('https://'));
          const tunnel = https || tunnels[0];
          if (tunnel && tunnel.public_url) {
            resolve(tunnel.public_url.replace(/\/$/, ''));
          } else {
            reject(new Error('No tunnel URL in ngrok response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => {
      req.destroy();
      reject(new Error('Timeout connecting to ngrok API'));
    });
  });
}

async function main() {
  console.log('Checking for ngrok tunnel at http://127.0.0.1:4040 ...');
  let publicUrl;
  try {
    publicUrl = await fetchNgrokUrl();
  } catch (e) {
    console.error('\n  Could not get ngrok URL. Is ngrok running?');
    console.error('  Start it in another terminal:  npm run tunnel\n');
    console.error('  Then run this again:  npm run dev:telegram\n');
    process.exit(1);
  }

  console.log('  Ngrok URL:', publicUrl);
  console.log('  Starting API with PUBLIC_API_URL=' + publicUrl + '\n');

  const env = { ...process.env, PUBLIC_API_URL: publicUrl };

  const child = spawn('npm', ['run', 'start:dev'], {
    env,
    stdio: 'inherit',
    shell: true,
  });

  child.on('error', (err) => {
    console.error('Failed to start API:', err);
    process.exit(1);
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main();
