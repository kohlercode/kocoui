#!/usr/bin/env node
// Build the frontend, package the app and install it on a provisioned VPS over SSH.
//
//   npm run deploy -- --host <ssh host> [--domain ui.example.com] [--app-name "Hermes"]
//                     [--default-lang en|de] [--app-user hermesweb] [--skip-build]
//
// The SSH host must log in as root (install-release.sh sets ownership and reloads PHP-FPM).
// --domain, --app-name and --default-lang only matter on the first install, when config.php is generated.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const IS_WIN = process.platform === 'win32';

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) fail(`unexpected argument ${a}`);
    const key = a.slice(2);
    if (key === 'skip-build') {
      out[key] = true;
      continue;
    }
    const value = argv[++i];
    if (value === undefined) fail(`${a} needs a value`);
    out[key] = value;
  }
  return out;
}

function run(cmd, args, opts = {}) {
  console.log(`> ${cmd} ${args.join(' ')}`);
  const r = opts.shell
    ? spawnSync([cmd, ...args].join(' '), { stdio: 'inherit', cwd: ROOT, ...opts })
    : spawnSync(cmd, args, { stdio: 'inherit', cwd: ROOT, ...opts });
  if (r.status !== 0) fail(`${cmd} failed (${r.status ?? r.error?.message})`);
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function nodeSatisfies(version) {
  const [major, minor] = version.split('.').map((n) => Number.parseInt(n, 10));
  if (major === 20) return minor >= 19;
  if (major > 22) return true;
  if (major === 22) return minor >= 12;
  return false;
}

const args = parseArgs(process.argv.slice(2));
const host = args.host;
if (!host || !/^[A-Za-z0-9._@-]+$/.test(host)) {
  fail('usage: npm run deploy -- --host <ssh host> [--domain <domain>] [--app-name <name>] [--default-lang en|de] [--app-user hermesweb] [--skip-build]');
}
const appUser = args['app-user'] || 'hermesweb';
if (!/^[a-z_][a-z0-9_-]*$/.test(appUser)) fail('invalid --app-user');
if (args.domain && !/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(args.domain)) fail('invalid --domain');

if (!nodeSatisfies(process.versions.node)) {
  fail(`Node.js ${process.versions.node} is too old. Need ^20.19.0 or >=22.12.0`);
}

if (!args['skip-build']) {
  run(IS_WIN ? 'npm.cmd' : 'npm', ['run', 'build'], { shell: IS_WIN });
}
if (!existsSync(join(ROOT, 'app/public/assets/.vite/manifest.json'))) fail('frontend is not built');

const tmp = mkdtempSync(join(tmpdir(), 'kocoui-'));
try {
  const tgz = join(tmp, 'release.tgz');
  // Windows ships bsdtar in System32; a GNU tar earlier in PATH would read "C:" as a remote host.
  const tar = IS_WIN ? join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar';
  run(tar, ['-czf', tgz, '-C', join(ROOT, 'app'), 'bin', 'src', 'public', 'config/config.example.php']);

  const remoteDir = `/tmp/kocoui-release-${Date.now()}`;
  run('ssh', [host, `mkdir -m 700 ${remoteDir}`]);
  run('scp', ['-q', tgz, join(ROOT, 'deploy', 'install-release.sh'), `${host}:${remoteDir}/`]);

  const remoteArgs = ['--release', `${remoteDir}/release.tgz`, '--app-user', appUser];
  if (args.domain) remoteArgs.push('--domain', args.domain);
  if (args['app-name']) remoteArgs.push('--app-name', args['app-name']);
  if (args['default-lang']) remoteArgs.push('--default-lang', args['default-lang']);

  const script = `${remoteDir}/install-release.sh`;
  run('ssh', [
    host,
    `tr -d '\\r' < ${script} > ${script}.lf && bash ${script}.lf ${remoteArgs.map(shellQuote).join(' ')}; rc=$?; rm -rf ${remoteDir}; exit $rc`,
  ]);
  console.log('\nDeployed.');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
