import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Chave de criptografia do .env (deve ter 32 caracteres)
function getEncryptionKey(): Buffer {
  const key = process.env.SAP_ENCRYPTION_KEY || 'default-key-32-chars-for-dev!!';
  // Garantir que a chave tem exatamente 32 bytes
  return Buffer.from(key.padEnd(32, '0').slice(0, 32));
}

/**
 * Criptografa uma string usando AES-256-GCM
 * Retorna: iv:tag:ciphertext (em base64)
 */
export function encrypt(plainText: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plainText, 'utf8', 'base64');
  encrypted += cipher.final('base64');
  
  const tag = cipher.getAuthTag();
  
  // Formato: iv:tag:ciphertext (todos em base64)
  return `${iv.toString('base64')}:${tag.toString('base64')}:${encrypted}`;
}

/**
 * Descriptografa uma string criptografada com AES-256-GCM
 * Espera formato: iv:tag:ciphertext (em base64)
 */
export function decrypt(encryptedText: string): string {
  const key = getEncryptionKey();
  
  const parts = encryptedText.split(':');
  if (parts.length !== 3) {
    throw new Error('Formato de texto criptografado inválido');
  }
  
  const iv = Buffer.from(parts[0], 'base64');
  const tag = Buffer.from(parts[1], 'base64');
  const ciphertext = parts[2];
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  
  let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
  decrypted += decipher.final('utf8');
  
  return decrypted;
}

/**
 * Verifica se uma string está criptografada (formato válido)
 */
export function isEncrypted(text: string): boolean {
  if (!text) return false;
  const parts = text.split(':');
  return parts.length === 3;
}

/**
 * Mascara uma senha para exibição (ex: "****2025")
 */
export function maskPassword(password: string): string {
  if (!password || password.length <= 4) return '****';
  return '****' + password.slice(-4);
}

