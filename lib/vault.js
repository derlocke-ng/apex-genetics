// Password vault for the admin token. Runs in the browser and in Node 20+
// (both provide WebCrypto as globalThis.crypto).
//
// The GitHub token is encrypted with AES-256-GCM using a key derived from the
// password with PBKDF2-SHA256. The resulting vault.json is public, so it can be
// attacked offline: the password is the only protection and must be strong.

export const DEFAULT_ITERATIONS = 1_000_000;
export const MIN_PASSWORD_LENGTH = 14;

const subtle = () => {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto is not available (the admin must be served over HTTPS or localhost).');
  return globalThis.crypto.subtle;
};

const toB64 = (bytes) => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
};

const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function deriveKey(password, salt, iterations) {
  const material = await subtle().importKey('raw', new TextEncoder().encode(password.normalize('NFKC')), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Encrypt the admin session ({ token, owner, repo, branch }) with a password.
 * @returns {Promise<object>} JSON-serialisable vault
 */
export async function sealVault(session, password, { iterations = DEFAULT_ITERATIONS } = {}) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt, iterations);
  const plain = new TextEncoder().encode(JSON.stringify(session));
  const data = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, plain));
  return {
    version: 1,
    kdf: 'PBKDF2-SHA256',
    iterations,
    cipher: 'AES-256-GCM',
    salt: toB64(salt),
    iv: toB64(iv),
    data: toB64(data),
    created: new Date().toISOString().slice(0, 10),
  };
}

export class WrongPasswordError extends Error {
  constructor() {
    super('Wrong password.');
  }
}

/** Decrypt a vault. Throws WrongPasswordError if the password does not match. */
export async function openVault(vault, password) {
  if (!vault || vault.version !== 1 || vault.kdf !== 'PBKDF2-SHA256' || vault.cipher !== 'AES-256-GCM') {
    throw new Error('Unsupported vault format.');
  }
  const key = await deriveKey(password, fromB64(vault.salt), vault.iterations);
  let plain;
  try {
    plain = await subtle().decrypt({ name: 'AES-GCM', iv: fromB64(vault.iv) }, key, fromB64(vault.data));
  } catch {
    throw new WrongPasswordError();
  }
  const session = JSON.parse(new TextDecoder().decode(plain));
  if (!session || typeof session.token !== 'string') throw new Error('The vault does not contain a token.');
  return session;
}

/** Returns a list of reasons the password is too weak (empty = acceptable). */
export function passwordProblems(password) {
  const pw = String(password ?? '');
  const problems = [];
  if (pw.length < MIN_PASSWORD_LENGTH) problems.push(`use at least ${MIN_PASSWORD_LENGTH} characters`);
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length;
  const words = pw.trim().split(/[\s\-_.]+/).filter((w) => w.length >= 3).length;
  if (classes < 3 && words < 4) problems.push('mix upper/lower case, digits and symbols, or use a passphrase of 4+ words');
  if (/^(.)\1+$/.test(pw) || /(0123|1234|2345|3456|4567|5678|6789|abcd|qwer|asdf|password|passwort)/i.test(pw)) {
    problems.push('avoid obvious sequences and common words');
  }
  return problems;
}

/** A random, typeable password with ~140 bits of entropy. */
export function generatePassword(length = 24) {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const out = [];
  const limit = 256 - (256 % alphabet.length);
  while (out.length < length) {
    for (const b of globalThis.crypto.getRandomValues(new Uint8Array(length * 2))) {
      if (b < limit && out.length < length) out.push(alphabet[b % alphabet.length]);
    }
  }
  return out.join('').replace(/(.{6})(?=.)/g, '$1-');
}
