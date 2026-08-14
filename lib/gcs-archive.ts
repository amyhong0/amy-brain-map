import { Storage } from '@google-cloud/storage';
import crypto from 'crypto';
import { gzipSync, gunzipSync } from 'zlib';
import { database } from '@/lib/db';
import { createId, loadUnconsciousStore, normalizeEncryptionKey } from '@/lib/utils/unconscious-storage';

type ArchiveKind = 'backup' | 'export' | 'analysis_artifact';

interface ServiceAccountJson {
  project_id?: string;
  client_email?: string;
  private_key?: string;
  [key: string]: unknown;
}

let storageClient: Storage | null = null;

function config() {
  const bucketName = process.env.GCS_BUCKET_NAME?.trim();
  const serviceAccountRaw = process.env.GCS_SERVICE_ACCOUNT_JSON?.trim();
  const key = process.env.HISTORY_BACKUP_ENCRYPTION_KEY?.trim();
  if (!bucketName || !serviceAccountRaw || !key) {
    throw new Error('GCS_BUCKET_NAME, GCS_SERVICE_ACCOUNT_JSON, and HISTORY_BACKUP_ENCRYPTION_KEY must be configured before using backups or exports.');
  }
  let credentials: ServiceAccountJson;
  try {
    credentials = JSON.parse(serviceAccountRaw) as ServiceAccountJson;
  } catch {
    throw new Error('GCS_SERVICE_ACCOUNT_JSON must contain valid service account JSON.');
  }
  if (!credentials.project_id || !credentials.client_email || !credentials.private_key) {
    throw new Error('GCS_SERVICE_ACCOUNT_JSON is missing required service account fields.');
  }
  return { bucketName, credentials, key: normalizeEncryptionKey(key) };
}

function gcs() {
  const { credentials } = config();
  if (!storageClient) {
    storageClient = new Storage({
      projectId: credentials.project_id,
      credentials,
    });
  }
  return storageClient;
}

function userPathSegment(userId: string) {
  return crypto.createHash('sha256').update(userId, 'utf8').digest('hex').slice(0, 32);
}

function encrypt(payload: Buffer, key: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.from(JSON.stringify({
    v: 1,
    compression: 'gzip',
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ciphertext.toString('base64'),
  }), 'utf8');
}

function decrypt(envelopeRaw: Buffer, key: Buffer) {
  const envelope = JSON.parse(envelopeRaw.toString('utf8')) as { v?: number; compression?: string; iv?: string; tag?: string; data?: string };
  if (envelope.v !== 1 || envelope.compression !== 'gzip' || !envelope.iv || !envelope.tag || !envelope.data) {
    throw new Error('Invalid encrypted archive payload.');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  return gunzipSync(Buffer.concat([decipher.update(Buffer.from(envelope.data, 'base64')), decipher.final()]));
}

export async function createUserArchive(userId: string, kind: Extract<ArchiveKind, 'backup' | 'export'>) {
  const { bucketName, key } = config();
  const snapshot = await loadUnconsciousStore(userId);
  const createdAt = new Date().toISOString();
  const id = createId(kind);
  const objectPath = `private/${userPathSegment(userId)}/${kind}s/${createdAt.slice(0, 10)}/${id}.json.gz.aes`;
  const plain = Buffer.from(JSON.stringify({
    schemaVersion: 1,
    exportedAt: createdAt,
    kind,
    data: snapshot,
  }), 'utf8');
  const encrypted = encrypt(gzipSync(plain), key);

  await gcs().bucket(bucketName).file(objectPath).save(encrypted, {
    resumable: false,
    validation: 'crc32c',
    contentType: 'application/octet-stream',
    metadata: {
      cacheControl: 'no-store',
      metadata: { archiveVersion: '1', kind, userScope: userPathSegment(userId) },
    },
    preconditionOpts: { ifGenerationMatch: 0 },
  });
  await database().query(
    `INSERT INTO storage_exports (id, user_id, object_path, kind, encryption_version, content_type, byte_size)
     VALUES ($1, $2, $3, $4, 1, 'application/octet-stream', $5)`,
    [id, userId, objectPath, kind, encrypted.byteLength],
  );
  return { id, createdAt, byteSize: encrypted.byteLength };
}

export async function downloadUserExport(userId: string, archiveId: string) {
  const rows = await database().query(
    `SELECT object_path, kind FROM storage_exports
     WHERE id = $1 AND user_id = $2 AND kind = 'export' LIMIT 1`,
    [archiveId, userId],
  );
  if (!rows[0]) return null;
  const row = rows[0] as Record<string, unknown>;
  const { bucketName, key } = config();
  const [encrypted] = await gcs().bucket(bucketName).file(String(row.object_path)).download();
  const plain = decrypt(encrypted, key);
  return { body: plain, filename: `amy-brain-map-export-${archiveId}.json` };
}

export async function createBackupIfDue(userId: string): Promise<{ created: boolean; archiveId?: string }> {
  const rows = await database().query(
    `SELECT id FROM storage_exports
     WHERE user_id = $1 AND kind = 'backup' AND created_at > NOW() - INTERVAL '24 hours'
     ORDER BY created_at DESC LIMIT 1`,
    [userId],
  );
  if (rows[0]) return { created: false };
  const archive = await createUserArchive(userId, 'backup');
  return { created: true, archiveId: archive.id };
}
