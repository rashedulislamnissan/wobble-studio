/**
 * Free deploy to GitHub Pages: build, then publish dist/ to the gh-pages branch of the
 * `origin` remote. No GitHub Actions needed.
 *   npm run deploy
 * Social-card links need the absolute site URL; it is derived from the origin remote.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts });
const read = (cmd, args) => execFileSync(cmd, args, { encoding: 'utf8' }).trim();

const remote = read('git', ['remote', 'get-url', 'origin']);
const m = remote.match(/github\.com[/:]([^/]+)\/([^/.]+)(\.git)?$/);
if (!m) throw new Error(`origin is not a GitHub repo: ${remote}`);
const [, owner, repo] = m;
const siteUrl = `https://${owner.toLowerCase()}.github.io/${repo}/`;
console.log(`Building for ${siteUrl}`);
run('npx', ['vite', 'build'], { env: { ...process.env, VITE_SITE_URL: siteUrl } });

// Publish dist/ as a fresh single-commit gh-pages branch.
const dist = path.resolve('dist');
fs.writeFileSync(path.join(dist, '.nojekyll'), ''); // serve files as-is
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'wobble-pages-'));
fs.cpSync(dist, tmp, { recursive: true });
const git = (...args) => run('git', args, { cwd: tmp });
git('init', '-q', '-b', 'gh-pages');
git('config', 'user.name', read('git', ['config', 'user.name']));
git('config', 'user.email', read('git', ['config', 'user.email']));
git('add', '-A');
git('commit', '-q', '-m', `Deploy ${read('git', ['rev-parse', '--short', 'HEAD'])}`);
git('push', '-f', '-q', remote, 'gh-pages');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Published. Live in a minute or two at ${siteUrl}`);
