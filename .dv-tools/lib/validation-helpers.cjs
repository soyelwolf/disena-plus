#!/usr/bin/env node

// Local patched copy of the power-pages plugin's validation-helpers.js.
// Only change: getAuthToken() uses execSync (string form, goes through a shell)
// instead of execFileSync (shell:false), because on this Windows machine `az` is
// a .cmd shim and execFileSync cannot spawn .cmd files without a shell (EINVAL).

const { execSync } = require('child_process');

/**
 * Gets an Azure CLI access token for the given resource URL.
 * @returns {string|null} Access token, or null if unavailable
 */
function getAuthToken(resourceUrl) {
  try {
    const out = execSync(
      `az account get-access-token --resource ${resourceUrl} --query accessToken -o tsv`,
      { encoding: 'utf8', timeout: 15000 }
    );
    return out.trim();
  } catch {
    return null;
  }
}

/**
 * Makes an HTTP/HTTPS request using Node.js built-in modules.
 */
function makeRequest({ url, method = 'GET', headers = {}, body = null, includeHeaders = false, timeout = 15000 }) {
  return new Promise((resolve) => {
    const https = require('https');
    const http = require('http');
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(
      {
        method,
        headers,
        hostname: u.hostname,
        port: u.port || undefined,
        path: u.pathname + u.search,
        timeout,
      },
      (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const result = { statusCode: res.statusCode, body: data };
          if (includeHeaders) result.headers = res.headers;
          resolve(result);
        });
      }
    );
    req.on('error', (e) => resolve({ error: e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ error: 'Request timed out' });
    });
    if (body) req.write(body);
    req.end();
  });
}

module.exports = {
  getAuthToken,
  makeRequest,
};
