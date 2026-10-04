import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { sealVault, openVault, WrongPasswordError, passwordProblems, generatePassword } from '../lib/vault.js';

const session = { token: 'github_pat_example', owner: 'o', repo: 'r', branch: 'main' };

test('vault round-trips with the right password', async () => {
  const vault = await sealVault(session, 'correct horse battery staple', { iterations: 1000 });
  assert.equal(vault.iterations, 1000);
  assert.ok(!JSON.stringify(vault).includes('github_pat_example'));
  assert.deepEqual(await openVault(vault, 'correct horse battery staple'), session);
});

test('wrong password and tampering are rejected', async () => {
  const vault = await sealVault(session, 'correct horse battery staple', { iterations: 1000 });
  await assert.rejects(openVault(vault, 'Correct horse battery staple'), WrongPasswordError);
  const bytes = Uint8Array.from(atob(vault.data), (c) => c.charCodeAt(0));
  bytes[0] ^= 1;
  const tampered = { ...vault, data: btoa(String.fromCharCode(...bytes)) };
  await assert.rejects(openVault(tampered, 'correct horse battery staple'), WrongPasswordError);
});

test('every vault uses a fresh salt and iv', async () => {
  const a = await sealVault(session, 'correct horse battery staple', { iterations: 1000 });
  const b = await sealVault(session, 'correct horse battery staple', { iterations: 1000 });
  assert.notEqual(a.salt, b.salt);
  assert.notEqual(a.iv, b.iv);
  assert.notEqual(a.data, b.data);
});

test('password strength rules', () => {
  assert.ok(passwordProblems('hunter2').length > 0);
  assert.ok(passwordProblems('aaaaaaaaaaaaaaaa').length > 0);
  assert.ok(passwordProblems('Password12345678!').length > 0);
  assert.deepEqual(passwordProblems('kiwi orbit lantern meadow'), []);
  assert.deepEqual(passwordProblems('Tr0ub4dor&3-xyzzy'), []);
  for (let i = 0; i < 50; i++) assert.deepEqual(passwordProblems(generatePassword()), []);
});

test('npm run vault writes a vault the default settings can open', async () => {
  const file = new URL('../admin/vault.json', import.meta.url);
  const backup = fs.existsSync(file) ? fs.readFileSync(file) : null;
  try {
    execFileSync(process.execPath, ['scripts/vault.js'], {
      cwd: new URL('..', import.meta.url),
      env: { ...process.env, ADMIN_TOKEN: 'github_pat_cli', ADMIN_PASSWORD: 'kiwi orbit lantern meadow' },
      stdio: 'pipe',
    });
    const vault = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(vault.iterations, 1_000_000);
    const opened = await openVault(vault, 'kiwi orbit lantern meadow');
    assert.equal(opened.token, 'github_pat_cli');
    assert.equal(opened.owner, 'derlocke-ng');
  } finally {
    if (backup) fs.writeFileSync(file, backup);
    else fs.rmSync(file, { force: true });
  }
});
