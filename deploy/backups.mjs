#!/usr/bin/env node
// Download the VPS backups written by backup.sh to this machine. Only new files are
// fetched; nothing is deleted locally.
//
//   npm run backups -- --host <ssh host> [--dest C:\Backups] [--remote-dir /var/backups/hermes]
//
// Files land in <dest>/<host>/. They contain every secret of the box (.env, API key,
// TOTP secrets), so on Windows the folder is restricted to the current user.
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, renameSync, statSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const IS_WIN = process.platform === 'win32';
const NAME = /^(hermes|webapp)-[0-9_-]+\.(zip|tgz)$/;

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 2) {
  if (!argv[i].startsWith('--') || argv[i + 1] === undefined) fail(`bad argument ${argv[i]}`);
  args[argv[i].slice(2)] = argv[i + 1];
}
const host = args.host;
if (!host || !/^[A-Za-z0-9._@-]+$/.test(host)) {
  fail('usage: npm run backups -- --host <ssh host> [--dest <folder>] [--remote-dir /var/backups/hermes]');
}
const remoteDir = args['remote-dir'] || '/var/backups/hermes';
if (!/^\/[A-Za-z0-9._\/-]+$/.test(remoteDir)) fail('invalid --remote-dir');
const dest = join(args.dest || (IS_WIN ? 'C:\\Backups' : join(homedir(), 'Backups')), host.replace(/^.*@/, ''));

const list = spawnSync('ssh', ['-o', 'BatchMode=yes', host, `cd ${remoteDir} && stat -c '%n %s' -- *`], { encoding: 'utf8' });
if (list.status !== 0) fail(`listing ${host}:${remoteDir} failed: ${list.stderr.trim()}`);
const remote = list.stdout
  .split('\n')
  .map((l) => l.trim().split(' '))
  .filter(([name, size]) => NAME.test(name || '') && /^\d+$/.test(size || ''))
  .map(([name, size]) => ({ name, size: Number(size) }));
if (remote.length === 0) fail(`no backups found in ${host}:${remoteDir}`);

if (!existsSync(dest)) {
  mkdirSync(dest, { recursive: true });
  if (IS_WIN) {
    const r = spawnSync('icacls', [dest, '/inheritance:r', '/grant:r', `${process.env.USERNAME}:(OI)(CI)F`, '/grant:r', 'SYSTEM:(OI)(CI)F'], { encoding: 'utf8' });
    if (r.status !== 0) console.warn(`warning: could not restrict ${dest}: ${r.stdout}${r.stderr}`);
  }
}

let fetched = 0;
for (const f of remote) {
  const local = join(dest, f.name);
  if (existsSync(local) && statSync(local).size === f.size) continue;
  const part = `${local}.part`;
  const r = spawnSync('scp', ['-q', '-o', 'BatchMode=yes', `${host}:${remoteDir}/${f.name}`, part], { stdio: 'inherit' });
  if (r.status !== 0 || !existsSync(part) || statSync(part).size !== f.size) {
    if (existsSync(part)) unlinkSync(part);
    fail(`download of ${f.name} failed`);
  }
  renameSync(part, local);
  fetched++;
  console.log(`  + ${f.name} (${(f.size / 1024).toFixed(0)} KB)`);
}
console.log(`${fetched} new, ${remote.length - fetched} already present -> ${dest}`);
