#!/usr/bin/env node
// Create admin/vault.json: your GitHub token, encrypted with an admin password.
//
//   npm run vault
//
// Non-interactive (e.g. for CI or scripts): ADMIN_TOKEN=... ADMIN_PASSWORD=... npm run vault

import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { sealVault, passwordProblems, generatePassword } from '../lib/vault.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'admin', 'vault.json');

function ask(question, { hidden = false } = {}) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) {
      rl._writeToOutput = (s) => {
        if (s.includes(question)) rl.output.write(question);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

const site = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.json'), 'utf8'));
const repo = site.repo || {};

console.log('🔐 Encrypt your GitHub token with an admin password\n');
console.log('Token: fine-grained token for this repository with "Contents: Read and write"');
console.log('       (optional: "Actions: Read"), from https://github.com/settings/personal-access-tokens/new\n');

const token = process.env.ADMIN_TOKEN || (await ask('GitHub token: ', { hidden: true }));
if (!token) {
  console.error('❌ No token given.');
  process.exit(1);
}

let password = process.env.ADMIN_PASSWORD;
if (!password) {
  console.log(`\nChoose a strong admin password (min. 14 characters). Suggestion: ${generatePassword()}`);
  for (;;) {
    password = await ask('Admin password: ', { hidden: true });
    const problems = passwordProblems(password);
    if (problems.length) {
      console.log(`⚠️  Too weak: ${problems.join('; ')}.`);
      continue;
    }
    if ((await ask('Repeat password: ', { hidden: true })) !== password) {
      console.log('⚠️  The passwords do not match.');
      continue;
    }
    break;
  }
} else if (passwordProblems(password).length) {
  console.error(`❌ ADMIN_PASSWORD is too weak: ${passwordProblems(password).join('; ')}.`);
  process.exit(1);
}

const vault = await sealVault({ token, owner: repo.owner, repo: repo.name, branch: repo.branch || 'main' }, password);
fs.writeFileSync(OUT, `${JSON.stringify(vault, null, 2)}\n`);
console.log(`\n✅ Wrote ${path.relative(process.cwd(), OUT)}. Commit and push it, then unlock the admin with your password.`);
