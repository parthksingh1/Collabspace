import * as crypto from 'node:crypto';

// ─── AES-256-GCM Encryption ───────────────────────────────────────

const AES_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV for GCM
const AUTH_TAG_LENGTH = 16;
const SALT_LENGTH = 16;

export interface EncryptedData {
  ciphertext: string; // base64
  iv: string; // base64
  authTag: string; // base64
  salt: string; // base64
}

/**
 * Derive a 256-bit key from a passphrase using PBKDF2.
 */
function deriveKey(key: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(key, salt, 100_000, 32, 'sha256', (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Encrypt data using AES-256-GCM.
 */
export async function encrypt(data: string, key: string): Promise<EncryptedData> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const derivedKey = await deriveKey(key, salt);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(AES_ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
    salt: salt.toString('base64'),
  };
}

/**
 * Decrypt data encrypted with AES-256-GCM.
 */
export async function decrypt(encryptedData: EncryptedData, key: string): Promise<string> {
  const salt = Buffer.from(encryptedData.salt, 'base64');
  const derivedKey = await deriveKey(key, salt);
  const iv = Buffer.from(encryptedData.iv, 'base64');
  const authTag = Buffer.from(encryptedData.authTag, 'base64');
  const ciphertext = Buffer.from(encryptedData.ciphertext, 'base64');

  const decipher = crypto.createDecipheriv(AES_ALGORITHM, derivedKey, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return decrypted.toString('utf8');
}

// ─── Password Hashing (scrypt) ─────────────────────────────────────

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384; // N
const SCRYPT_BLOCK_SIZE = 8; // r
const SCRYPT_PARALLELIZATION = 1; // p

/**
 * Hash a password using scrypt (similar to bcrypt security properties).
 * Returns a string in the format: salt:hash (both base64-encoded).
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(SALT_LENGTH);

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(`${salt.toString('base64')}:${derivedKey.toString('base64')}`);
      },
    );
  });
}

/**
 * Verify a password against a hash produced by hashPassword.
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const [saltBase64, hashBase64] = hash.split(':');
  if (!saltBase64 || !hashBase64) {
    throw new Error('Invalid password hash format');
  }

  const salt = Buffer.from(saltBase64, 'base64');
  const expectedHash = Buffer.from(hashBase64, 'base64');

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, derivedKey) => {
        if (err) reject(err);
        else resolve(crypto.timingSafeEqual(derivedKey, expectedHash));
      },
    );
  });
}

// ─── Token Generation ──────────────────────────────────────────────

/**
 * Generate a cryptographically secure random token.
 * @param length Number of bytes (output will be hex-encoded, so 2x length characters).
 */
export function generateToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

// ─── Key Pair Generation for E2E Encryption ────────────────────────

export interface KeyPair {
  publicKey: string; // PEM-encoded
  privateKey: string; // PEM-encoded
}

/**
 * Generate an RSA key pair for end-to-end encryption.
 */
export function generateKeyPair(): Promise<KeyPair> {
  return new Promise((resolve, reject) => {
    crypto.generateKeyPair(
      'rsa',
      {
        modulusLength: 4096,
        publicKeyEncoding: {
          type: 'spki',
          format: 'pem',
        },
        privateKeyEncoding: {
          type: 'pkcs8',
          format: 'pem',
        },
      },
      (err, publicKey, privateKey) => {
        if (err) reject(err);
        else resolve({ publicKey, privateKey });
      },
    );
  });
}
