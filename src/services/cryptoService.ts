import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { config } from '../config';
import { logger } from '../config/logger';

/**
 * Ed25519 cryptographic service for response signing and offline licence files.
 * Reference: Architecture Doc, Sections 4.2, 4.5, 8
 *
 * - Check-in responses are signed so the V5 client can verify authenticity
 * - Offline licence files are signed for air-gapped deployments
 * - Private key stored in Azure Key Vault in production, local file in dev
 */

let privateKey: crypto.KeyObject | null = null;
let publicKey: crypto.KeyObject | null = null;

/**
 * Initialise Ed25519 keys from filesystem.
 * In production, the private key would be loaded from Azure Key Vault.
 */
export function initialiseKeys(): void {
  const privateKeyPath = path.resolve(config.ed25519.privateKeyPath);
  const publicKeyPath = path.resolve(config.ed25519.publicKeyPath);

  try {
    if (fs.existsSync(privateKeyPath)) {
      const privatePem = fs.readFileSync(privateKeyPath, 'utf8');
      privateKey = crypto.createPrivateKey(privatePem);
      logger.info('Ed25519 private key loaded');
    } else {
      logger.warn('Ed25519 private key not found — generating development keypair');
      generateDevKeypair(privateKeyPath, publicKeyPath);
    }

    if (fs.existsSync(publicKeyPath)) {
      const publicPem = fs.readFileSync(publicKeyPath, 'utf8');
      publicKey = crypto.createPublicKey(publicPem);
      logger.info('Ed25519 public key loaded');
    }
  } catch (error) {
    logger.error('Failed to load Ed25519 keys', { error });
    throw new Error('Failed to initialise cryptographic keys');
  }
}

/**
 * Generate a development Ed25519 keypair and write to disk.
 * This is for local development only — production keys are in Azure Key Vault.
 */
function generateDevKeypair(privateKeyPath: string, publicKeyPath: string): void {
  const { publicKey: pubKey, privateKey: privKey } = crypto.generateKeyPairSync('ed25519');

  const keysDir = path.dirname(privateKeyPath);
  if (!fs.existsSync(keysDir)) {
    fs.mkdirSync(keysDir, { recursive: true });
  }

  fs.writeFileSync(
    privateKeyPath,
    privKey.export({ type: 'pkcs8', format: 'pem' }) as string
  );
  fs.writeFileSync(
    publicKeyPath,
    pubKey.export({ type: 'spki', format: 'pem' }) as string
  );

  privateKey = privKey;
  publicKey = pubKey;

  logger.info('Development Ed25519 keypair generated', { privateKeyPath, publicKeyPath });
}

/**
 * Sign data with the Ed25519 private key.
 * Returns a base64-encoded signature.
 */
export function signData(data: string): string {
  if (!privateKey) {
    throw new Error('Ed25519 private key not initialised');
  }

  const signature = crypto.sign(null, Buffer.from(data), privateKey);
  return signature.toString('base64');
}

/**
 * Verify an Ed25519 signature against data.
 */
export function verifySignature(data: string, signature: string): boolean {
  if (!publicKey) {
    throw new Error('Ed25519 public key not initialised');
  }

  return crypto.verify(null, Buffer.from(data), publicKey, Buffer.from(signature, 'base64'));
}

/**
 * Sign a check-in response payload.
 * The V5 client uses the embedded public key to verify this signature.
 */
export function signCheckInResponse(response: {
  status: string;
  licensedUsers: number;
  expiryDate: string;
  features: Record<string, unknown>;
  message: string;
}): string {
  const payload = JSON.stringify(response);
  return signData(payload);
}

/**
 * Generate a signed offline licence file payload.
 * Reference: Architecture Doc, Section 4.5
 *
 * The offline licence file is a JSON document signed with Ed25519.
 * V5 instances validate this file using the embedded public key to
 * operate without network access to the licence server.
 */
export function generateOfflineLicenceFile(params: {
  licenceId: string;
  customerName: string;
  licensedUsers: number;
  deploymentModel: string;
  expiryDate: string;
  instanceId: string | null;
  validityDays: number;
}): { payload: string; signature: string; fileHash: string } {
  const fileContent = {
    formatVersion: 2,
    type: 'pro-curo-offline-licence',
    licenceId: params.licenceId,
    customerName: params.customerName,
    licensedUsers: params.licensedUsers,
    deploymentModel: params.deploymentModel,
    expiryDate: params.expiryDate,
    instanceId: params.instanceId, // null = any instance, UUID = locked to specific instance
    validityDays: params.validityDays,
    issuedAt: new Date().toISOString(),
    issuer: 'Pro-curo Licence Server',
  };

  const payload = JSON.stringify(fileContent, null, 2);
  const signature = signData(payload);
  const fileHash = crypto.createHash('sha256').update(payload + signature).digest('hex');

  return { payload, signature, fileHash };
}

/**
 * Get the Ed25519 public key in PEM format.
 * This is embedded in V5 instances for signature verification.
 */
export function getPublicKeyPem(): string {
  if (!publicKey) {
    throw new Error('Ed25519 public key not initialised');
  }
  return publicKey.export({ type: 'spki', format: 'pem' }) as string;
}
