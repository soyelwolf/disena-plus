#!/usr/bin/env node

// Local patched copy of the power-pages plugin's dataverse-request.js.
// Usage: node dataverse-request.js <envUrl> <method> <apiPath> [--body <json>]

const { getAuthToken, makeRequest } = require('./lib/validation-helpers.cjs');

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.length < 3) {
    process.stderr.write(
      'Usage: node dataverse-request.js <envUrl> <method> <apiPath> [--body <json>] [--include-headers]\n'
    );
    process.exit(1);
  }

  const envUrl = args[0].replace(/\/+$/, '');
  const method = args[1].toUpperCase();
  const apiPath = args[2];
  let body = null;
  let includeHeaders = false;

  for (let i = 3; i < args.length; i++) {
    if (args[i] === '--body' && args[i + 1]) {
      body = args[++i];
    } else if (args[i] === '--include-headers') {
      includeHeaders = true;
    }
  }

  return { envUrl, method, apiPath, body, includeHeaders };
}

async function doRequest(envUrl, method, apiPath, body, token, includeHeaders) {
  const url = `${envUrl}/api/data/v9.2/${apiPath}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  const res = await makeRequest({
    url,
    method,
    headers,
    body,
    includeHeaders,
    timeout: 30000,
  });

  return res;
}

async function main() {
  const { envUrl, method, apiPath, body, includeHeaders } = parseArgs();

  let token = getAuthToken(envUrl);
  if (!token) {
    process.stderr.write('Failed to get Azure CLI token. Run `az login --allow-no-subscriptions` first.\n');
    process.exit(1);
  }

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await doRequest(envUrl, method, apiPath, body, token, includeHeaders);

    if (res.error) {
      if (attempt < maxRetries) continue;
      process.stderr.write(`Request failed: ${res.error}\n`);
      process.exit(1);
    }

    if (res.statusCode === 401 && attempt < maxRetries) {
      token = getAuthToken(envUrl);
      if (!token) {
        process.stderr.write('Token refresh failed. Run `az login --allow-no-subscriptions` again.\n');
        process.exit(1);
      }
      continue;
    }

    if ([429, 500, 502, 503].includes(res.statusCode) && attempt < maxRetries) {
      await new Promise((r) => setTimeout(r, 5000));
      continue;
    }

    let data = null;
    if (res.body) {
      try {
        data = JSON.parse(res.body);
      } catch {
        data = res.body;
      }
    }

    const output = { status: res.statusCode, data };
    if (includeHeaders && res.headers) {
      output.headers = res.headers;
    }
    console.log(JSON.stringify(output));
    return;
  }
}

main();
