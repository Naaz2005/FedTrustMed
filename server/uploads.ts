import path from 'path';
import crypto from 'crypto';
import { Request, Response, NextFunction, Router } from 'express';
import multer from 'multer';
import { pool } from './db.js';
import { encryptAES256GCM, decryptAES256GCM, computeSha256, generateSecureId } from './cryptoUtils.js';
import { insertAuditLog } from './auth.js';
import { anchorTransaction } from './blockchain.js';

export const DEFAULT_MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

export interface DetectedFileType {
  mime: string;
  ext: string;
}

/**
 * Detects real file type by analyzing header magic bytes.
 * Supports PDF, JPEG, and PNG. Returns null for unsupported or disguised files.
 */
export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (!buffer || buffer.length < 4) {
    return null;
  }

  // PDF magic bytes: %PDF (0x25, 0x50, 0x44, 0x46)
  if (
    buffer.length >= 4 &&
    buffer[0] === 0x25 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x44 &&
    buffer[3] === 0x46
  ) {
    return { mime: 'application/pdf', ext: 'pdf' };
  }

  // JPEG magic bytes: FF D8 FF
  if (
    buffer.length >= 3 &&
    buffer[0] === 0xff &&
    buffer[1] === 0xd8 &&
    buffer[2] === 0xff
  ) {
    return { mime: 'image/jpeg', ext: 'jpg' };
  }

  // PNG magic bytes: 89 50 4E 47 0D 0A 1A 0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', ext: 'png' };
  }

  return null;
}

export interface PdfActiveContentResult {
  hasActiveContent: boolean;
  matchedKeyword?: string;
}

/**
 * Scans a PDF buffer for potentially malicious active content or executable actions.
 * Detects /JavaScript, /JS, /Launch, and /EmbeddedFile including hex-encoded variants.
 */
export function detectPdfActiveContent(buffer: Buffer): PdfActiveContentResult {
  // Use latin1 so every byte value is 1-to-1 preserved without unicode decoding distortion
  const rawContent = buffer.toString('latin1');

  // Decode PDF hex-encoded name syntax (e.g., /Java#53cript -> /JavaScript)
  const normalizedContent = rawContent.replace(/#([0-9a-fA-F]{2})/g, (_, hex) => {
    return String.fromCharCode(parseInt(hex, 16));
  });

  const patterns: { name: string; regex: RegExp }[] = [
    { name: '/JavaScript', regex: /\/JavaScript/i },
    { name: '/JS', regex: /\/JS(?:[\s\r\n\<\>\[\]\(\)\/]|$)/i },
    { name: '/Launch', regex: /\/Launch(?:[\s\r\n\<\>\[\]\(\)\/]|$)/i },
    { name: '/EmbeddedFile', regex: /\/EmbeddedFile/i },
  ];

  for (const { name, regex } of patterns) {
    if (regex.test(rawContent) || regex.test(normalizedContent)) {
      return { hasActiveContent: true, matchedKeyword: name };
    }
  }

  return { hasActiveContent: false };
}

/**
 * Sanitizes a raw client filename:
 * - Strips directory traversal paths
 * - Removes null bytes and non-printable control characters
 * - Replaces dangerous filesystem characters (<>:"/\|?*)
 * - Trims dangerous leading/trailing dots and whitespace
 * - Caps maximum length at 255 characters to fit database schema
 */
export function sanitizeDisplayName(rawName: string): string {
  if (!rawName || typeof rawName !== 'string') {
    return 'document.bin';
  }

  // Extract base filename (removes ../ and directory paths)
  let name = path.basename(rawName.trim());

  // Remove null bytes and ASCII control characters (0-31, 127)
  name = name.replace(/[\x00-\x1F\x7F]/g, '');

  // Replace unsafe characters
  name = name.replace(/[<>:"/\\|?*]/g, '_');

  // Strip leading and trailing dots and whitespace
  name = name.replace(/^[.\s]+|[.\s]+$/g, '');

  if (!name) {
    name = 'document.bin';
  }

  // Cap at 255 characters while preserving file extension
  if (name.length > 255) {
    const ext = path.extname(name);
    const base = name.slice(0, 255 - ext.length);
    name = base + ext;
  }

  return name;
}

/**
 * Helper to get client IP
 */
function getClientIp(req: Request): string {
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

/**
 * Factory for reusable multer middleware with custom size limit and memory storage.
 */
export function createUploadMiddleware(options: { maxSizeBytes?: number } = {}) {
  const maxSizeBytes = options.maxSizeBytes ?? DEFAULT_MAX_FILE_SIZE;

  const uploader = multer({
    storage: multer.memoryStorage(),
    limits: {
      fileSize: maxSizeBytes,
      files: 1,
    },
  });

  return (fieldName: string = 'file') => {
    const multerSingle = uploader.single(fieldName);

    return (req: Request, res: Response, next: NextFunction) => {
      multerSingle(req, res, (err: any) => {
        if (err) {
          if (err instanceof multer.MulterError) {
            if (err.code === 'LIMIT_FILE_SIZE') {
              return res.status(413).json({
                error: `File size exceeds limit: maximum allowed size is ${Math.round(maxSizeBytes / (1024 * 1024))} MB`,
              });
            }
            return res.status(400).json({ error: `Upload rejected: ${err.message}` });
          }
          return res.status(400).json({ error: err.message || 'File upload failed' });
        }
        next();
      });
    };
  };
}

export const defaultUploadMiddleware = createUploadMiddleware();

export interface StoredDocument {
  id: string;
  ownerUserId: string;
  recordId: string | null;
  kind: string;
  originalName: string;
  mime: string;
  size: number;
  sha256: string;
  createdAt: Date;
}

/**
 * Validates, encrypts, and stores a document file into PostgreSQL documents table.
 */
export async function saveEncryptedDocument(params: {
  ownerUserId: string;
  recordId?: string | null;
  kind?: string;
  fileBuffer: Buffer;
  originalName: string;
}): Promise<StoredDocument> {
  const { ownerUserId, recordId, kind = 'GENERAL', fileBuffer, originalName } = params;

  if (!fileBuffer || fileBuffer.length === 0) {
    throw new Error('File payload is empty');
  }

  // 1. Validate real file type via magic bytes
  const detected = detectFileType(fileBuffer);
  if (!detected) {
    throw new Error('Unsupported or disguised file format. Allowed types: PDF, JPEG, PNG');
  }

  // 2. Active content scan for PDF files
  if (detected.mime === 'application/pdf') {
    const activeScan = detectPdfActiveContent(fileBuffer);
    if (activeScan.hasActiveContent) {
      throw new Error(`PDF rejected: contains active executable content (${activeScan.matchedKeyword})`);
    }
  }

  // 3. Sanitize display filename
  const cleanName = sanitizeDisplayName(originalName);

  // 4. Compute cryptographic SHA-256 of plaintext
  const sha256 = computeSha256(fileBuffer);

  // 5. Generate random storage identifier
  const storageId = generateSecureId('doc');

  // 6. Encrypt with AES-256-GCM
  const { ciphertext, iv, authTag } = encryptAES256GCM(fileBuffer);

  // 7. Insert into PostgreSQL documents table
  await pool.query(
    `INSERT INTO documents (
      id, owner_user_id, record_id, kind, original_name, mime, size, sha256, iv, auth_tag, ciphertext, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
    [
      storageId,
      ownerUserId,
      recordId || null,
      kind,
      cleanName,
      detected.mime,
      fileBuffer.length,
      sha256,
      iv,
      authTag,
      ciphertext,
    ]
  );

  // Anchor file SHA-256 in Audit Ledger (Module M24)
  await anchorTransaction({
    txType: 'FILE_ANCHORED',
    actorId: ownerUserId,
    resourceId: storageId,
    payload: {
      documentId: storageId,
      sha256,
      originalName: cleanName,
      mime: detected.mime,
      size: fileBuffer.length,
      kind,
      recordId: recordId || null,
    },
  }).catch((err) => console.error('[Ledger Anchor Error - File Anchored]:', err));

  return {
    id: storageId,
    ownerUserId,
    recordId: recordId || null,
    kind,
    originalName: cleanName,
    mime: detected.mime,
    size: fileBuffer.length,
    sha256,
    createdAt: new Date(),
  };
}

/**
 * Authorized document download handler:
 * - Checks authorization (document owner, doctor, or administrator)
 * - Decrypts AES-256-GCM ciphertext
 * - Streams with X-Content-Type-Options: nosniff
 * - Writes an audit_logs row for access tracking
 */
export async function streamAuthorizedDownload(
  documentId: string,
  req: Request,
  res: Response
): Promise<void> {
  const currentUser = (req as any).user;
  if (!currentUser) {
    res.status(401).json({ error: 'Authentication required' });
    return;
  }

  // Query document record from database
  const result = await pool.query('SELECT * FROM documents WHERE id = $1', [documentId]);
  const doc = result.rows[0];

  if (!doc) {
    res.status(404).json({ error: 'Document not found' });
    return;
  }

  // Hospital administrators must NEVER download clinical documents / medical reports
  if (currentUser.role === 'HOSPITAL_ADMIN' && (doc.record_id || doc.kind === 'MEDICAL_RECORD' || doc.kind === 'REPORT')) {
    res.status(403).json({ error: 'Access denied: Hospital administrators cannot access clinical documents' });
    return;
  }

  // Authorization check
  const isOwner = doc.owner_user_id === currentUser.id;
  const isAdmin = currentUser.role === 'SYSTEM_ADMIN' || currentUser.role === 'HOSPITAL_ADMIN';
  const isDoctor = currentUser.role === 'DOCTOR';

  if (!isOwner && !isAdmin && !isDoctor) {
    res.status(403).json({ error: 'Access denied: not authorized to download this document' });
    return;
  }

  // Decrypt ciphertext using stored IV and auth tag
  let plaintext: Buffer;
  try {
    plaintext = decryptAES256GCM({
      ciphertext: doc.ciphertext,
      iv: doc.iv,
      authTag: doc.auth_tag,
    });
  } catch (err: any) {
    console.error(`Document decryption error for ${documentId}:`, err);
    res.status(500).json({ error: 'Document decryption failed or data integrity compromised' });
    return;
  }

  // Record audit log entry
  try {
    await insertAuditLog({
      userId: currentUser.id,
      userName: currentUser.fullName || currentUser.full_name || currentUser.email || 'User',
      userRole: currentUser.role,
      hospitalId: currentUser.hospitalId || currentUser.hospital_id || null,
      hospitalName: currentUser.hospitalName || currentUser.hospital_name || 'N/A',
      action: 'DOCUMENT_DOWNLOAD',
      resourceId: doc.id,
      ipAddress: getClientIp(req),
      trustImpact: 0,
      details: `Downloaded document: ${doc.original_name} (${doc.id})`,
    });
  } catch (auditErr) {
    console.error('Failed to write download audit log:', auditErr);
  }

  // Security response headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Type', doc.mime);
  res.setHeader('Content-Length', plaintext.length);
  res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.original_name)}"`);

  res.status(200).send(plaintext);
}

/**
 * Dev-only test router to exercise upload and download flows.
 * NOT wired into registration or records yet.
 */
export const uploadsTestRouter = Router();

// POST /api/test/uploads
uploadsTestRouter.post(
  '/',
  defaultUploadMiddleware('file'),
  async (req: Request, res: Response) => {
    if (!req.file) {
      return res.status(400).json({ error: 'No file provided in request (field: file)' });
    }

    const currentUser = (req as any).user;
    if (!currentUser) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    const ownerUserId = currentUser.id;

    try {
      const savedDoc = await saveEncryptedDocument({
        ownerUserId,
        recordId: (req.body?.recordId as string) || null,
        kind: (req.body?.kind as string) || 'GENERAL',
        fileBuffer: req.file.buffer,
        originalName: req.file.originalname,
      });

      // Write audit row for upload
      await insertAuditLog({
        userId: currentUser.id,
        userName: currentUser.fullName || currentUser.full_name || currentUser.email || 'User',
        userRole: currentUser.role,
        hospitalId: currentUser.hospitalId || currentUser.hospital_id || null,
        hospitalName: currentUser.hospitalName || currentUser.hospital_name || 'N/A',
        action: 'DOCUMENT_UPLOAD',
        resourceId: savedDoc.id,
        ipAddress: getClientIp(req),
        trustImpact: 0,
        details: `Uploaded document: ${savedDoc.originalName} (${savedDoc.id})`,
      });

      return res.status(201).json({
        success: true,
        document: savedDoc,
      });
    } catch (err: any) {
      return res.status(400).json({ error: err.message || 'Upload processing failed' });
    }
  }
);

// GET /api/test/uploads/:id
uploadsTestRouter.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  await streamAuthorizedDownload(id, req, res);
});
