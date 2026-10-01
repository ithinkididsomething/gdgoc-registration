/**
 * Starts the API and the web app together, in one terminal.
 *
 * WHY THEY ARE SEPARATE PROCESSES AT ALL
 * --------------------------------------
 * They are two halves of one app, and that separation is the security model,
 * not an accident:
 *
 *   - The 8 Google Form URLs live ONLY in the backend. The register endpoint
 *     resolves just the two verticals the student picked and returns only
 *     those. A single static bundle could not do that, because anything in a
 *     bundle is readable by every visitor.
 *   - The student roster (roll number -> name/branch) also stays server-side,
 *     so the API can validate a lookup without ever sending the whole roster
 *     to the browser.
 *   - They deploy differently too: the frontend is static files that any host
 *     can serve, the backend needs a Node runtime.
 *
 * In development the browser still sees ONE origin, because Vite proxies /api
 * through to Express (see vite.config.ts). So CORS never applies locally and
 * the client only ever uses relative "/api" paths.
 *
 * This script is a convenience wrapper. It is careful about the two failure
 * modes that actually bite when you already have a server running:
 *
 *   1. Vite normally "helpfully" moves to the next free port when 5173 is busy
 *      (5174, 5175, ...). That is actively harmful here: you would edit one
 *      origin and open another, and the form POST would hit a different app
 *      than the one you are looking at. So this passes --strictPort, which
 *      makes Vite fail loudly instead of drifting.
 *   2. If the API port is taken, the backend's `node --watch` does not exit -
 *      it reports EADDRINUSE and sits waiting for a file change, so it looks
 *      like it is running but never listens. Worse, a DIFFERENT process may
 *      already own the port. So both ports are probed first and only the
 *      halves that are genuinely missing get started.
 *
 * Ctrl+C stops only what this script started.
 *
 * No dependencies: node:child_process only.
 *
 * Run: npm run dev:all
 */

import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FRONTEND = path.resolve(HERE, '..');
const BACKEND = path.resolve(FRONTEND, '..', 'gdgoc-registration-backend');

const API_PORT = process.env.PORT || '3000';
const WEB_PORT = process.env.WEB_PORT || '5173';
const READY_TIMEOUT_MS = 20_000;

const C = {
  api: '\x1b[36m',
  web: '\x1b[35m',
  dim: '\x1b[2m',
  warn: '\x1b[33m',
  err: '\x1b[31m',
  ok: '\x1b[32m',
  reset: '\x1b[0m',
};

const out = (line = '') => process.stdout.write(`${line}\n`);

/** Prefixes each child's output so the two streams stay readable when mixed. */
function pipeWithLabel(stream, label, colour) {
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';
    for (const line of lines) out(`${colour}[${label}]${C.reset} ${line}`);
  });
}

const children = [];
let shuttingDown = false;

function start(name, colour, args, cwd) {
  const child = spawn('npm', args, {
    cwd,
    stdio: ['ignore', 'pipe', 'pipe'],
    // Own process group on POSIX so a Ctrl+C reaches the children too.
    detached: process.platform !== 'win32',
    shell: process.platform === 'win32',
  });
  pipeWithLabel(child.stdout, name, colour);
  pipeWithLabel(child.stderr, name, colour);
  child.on('exit', (code, signal) => {
    if (shuttingDown) return;
    if (code === 0 || signal === 'SIGTERM') return; // expected stop
    out(`${colour}[${name}]${C.reset} ${C.err}exited unexpectedly (${signal ?? code})${C.reset}`);
    shutdown(1);
  });
  children.push({ name, child });
  return child;
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of children) {
    try {
      if (process.platform === 'win32' && child.pid) {
        // Windows spawns via a shell, so kill the whole tree - otherwise node
        // survives and keeps holding the port.
        spawn('taskkill', ['/pid', String(child.pid), '/f', '/t'], { stdio: 'ignore' });
      } else if (child.pid) {
        process.kill(-child.pid, 'SIGTERM');
      }
    } catch {
      /* already gone */
    }
  }
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

/**
 * Probes one URL, resolving true when it answers with a non-5xx status.
 *
 * Uses node:http with `agent: false` rather than fetch on purpose. Two reasons:
 *
 *   - `agent: false` disables keep-alive, so every probe socket is closed as
 *     soon as it is drained. With fetch, the undici connection pool is still
 *     holding handles when this script calls process.exit(), and on Windows that
 *     trips a libuv assertion ("Assertion failed: !(handle->flags &
 *     UV_HANDLE_CLOSING)", exit code -1073740791). The crash happened *after*
 *     all the useful work, which is the worst place for it.
 *   - A socket that is open but not listening can hang the probe forever, so the
 *     per-attempt timeout is what keeps the preflight from wedging on the very
 *     thing it is trying to diagnose.
 */
function reachable(url, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const req = http.get(url, { agent: false }, (res) => {
      res.resume(); // drain, so the socket can close
      resolve(res.statusCode < 500);
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      resolve(false);
    });
    req.on('error', () => resolve(false));
  });
}

/**
 * Tries each candidate until one answers.
 *
 * Both hosts are needed, and this is not paranoia: Vite's dev server binds the
 * IPv6 loopback (::1) on this machine, so a probe against 127.0.0.1 is refused
 * and the port looks free when the server is actually right there. Probing only
 * 127.0.0.1 then makes the launcher start a second Vite, which --strictPort
 * correctly kills. Express binds IPv4, so the order is per-service.
 */
async function reachableAny(urls) {
  for (const url of urls) {
    if (await reachable(url)) return true;
  }
  return false;
}

const WEB_URLS = [
  `http://localhost:${WEB_PORT}/`, // ::1 on this machine
  `http://127.0.0.1:${WEB_PORT}/`, // IPv4 elsewhere
];
const API_URLS = [
  `http://127.0.0.1:${API_PORT}/api/lookup/__startup_probe__`,
  `http://localhost:${API_PORT}/api/lookup/__startup_probe__`,
];

async function waitFor(label, urls, colour) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    if (await reachableAny(urls)) return true;
    await new Promise((r) => setTimeout(r, 250));
  }
  out(`  ${colour}${label}${C.reset} ${C.err}did not come up on port ${label === 'API' ? API_PORT : WEB_PORT} within ${READY_TIMEOUT_MS / 1000}s${C.reset}`);
  return false;
}

// --- preflight: what is already running? ---------------------------------
const [apiUp, webUp] = await Promise.all([reachableAny(API_URLS), reachableAny(WEB_URLS)]);

out();
if (apiUp && webUp) {
  out(`  ${C.ok}Everything is already running.${C.reset}`);
  out(`  ${C.dim}Nothing to start - leaving your existing servers untouched.${C.reset}`);
  out(`  ${C.web}Open the app:${C.reset} http://localhost:${WEB_PORT}`);
  out();
  process.exit(0);
}

if (apiUp) {
  out(`  ${C.api}API already serving on port ${API_PORT} - reusing it.${C.reset}`);
}
if (webUp) {
  out(`  ${C.web}Web app already serving on port ${WEB_PORT} - reusing it.${C.reset}`);
}
out();

// --- start only what is missing ------------------------------------------
if (!apiUp) start('api', C.api, ['run', 'dev'], BACKEND);
if (!webUp) {
  // --strictPort: fail loudly rather than silently sliding to 5174.
  start('web', C.web, ['run', 'dev', '--', '--strictPort'], FRONTEND);
}

if (apiUp) out(`  ${C.api}API ready on ${C.dim}http://localhost:${API_PORT}${C.reset}`);
else await waitFor('API', API_URLS, C.api);

if (webUp) out(`  ${C.web}Web ready on ${C.dim}http://localhost:${WEB_PORT}${C.reset}`);
else await waitFor('Web', WEB_URLS, C.web);

out();
out(`  ${C.web}Open the app:${C.reset} http://localhost:${WEB_PORT}`);
out(`  ${C.dim}use localhost, not 127.0.0.1 - Vite binds IPv6 ::1 only${C.reset}`);
if (children.length) out(`  ${C.dim}Ctrl+C stops ${children.length === 2 ? 'both' : 'what this started'}.${C.reset}`);
out();
