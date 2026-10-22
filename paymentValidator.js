const fs = require('fs');
const path = require('path');

const ALLOWED_MIME_TYPES = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'application/pdf': 'pdf'
};

const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const MIN_FILE_SIZE = 50; // 50 bytes

/**
 * Validates the transaction reference / UTR ID.
 */
function validatePaymentRef(payment_ref) {
  if (!payment_ref || typeof payment_ref !== 'string') {
    return { valid: false, error: 'Transaction reference or UTR number is required.' };
  }

  const trimmed = payment_ref.trim();
  if (trimmed.length < 4) {
    return { valid: false, error: 'Transaction reference ID must be at least 4 characters.' };
  }

  if (trimmed.length > 64) {
    return { valid: false, error: 'Transaction reference ID exceeds maximum limit of 64 characters.' };
  }

  // Allow alphanumeric characters, hyphens, underscores, slashes, periods, and spaces
  const validPattern = /^[a-zA-Z0-9_\-\/\.\s]+$/;
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: 'Transaction reference ID contains invalid characters. Use alphanumeric characters, hyphens, or slashes.' };
  }

  return { valid: true, sanitized: trimmed };
}

/**
 * Verifies magic header bytes of the buffer to prevent spoofed MIME types.
 */
function verifyMagicBytes(buffer, claimedMime) {
  if (buffer.length < 4) return false;

  // PNG: 89 50 4E 47
  if (claimedMime === 'image/png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }

  // JPEG / JPG: FF D8 FF
  if (claimedMime === 'image/jpeg' || claimedMime === 'image/jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }

  // PDF: %PDF (25 50 44 46)
  if (claimedMime === 'application/pdf') {
    return buffer.slice(0, 4).toString('ascii') === '%PDF';
  }

  // WebP: RIFF....WEBP
  if (claimedMime === 'image/webp') {
    return (
      buffer.length >= 12 &&
      buffer.slice(0, 4).toString('ascii') === 'RIFF' &&
      buffer.slice(8, 12).toString('ascii') === 'WEBP'
    );
  }

  return false;
}

/**
 * Validates the base64-encoded payment proof payload.
 */
function validatePaymentProofPayload(payment_proof, original_filename) {
  if (!payment_proof || typeof payment_proof !== 'string') {
    return { valid: false, error: 'Payment transaction screenshot proof is required.' };
  }

  const trimmed = payment_proof.trim();

  // Parse data URL format
  const dataUrlMatch = trimmed.match(/^data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+);base64,(.+)$/);
  let mimeType = null;
  let base64Data = null;

  if (dataUrlMatch) {
    mimeType = dataUrlMatch[1].toLowerCase();
    base64Data = dataUrlMatch[2];
  } else {
    // If raw base64 string provided, check if filename gives hint or default to png
    const ext = original_filename ? path.extname(original_filename).toLowerCase() : '';
    if (ext === '.pdf') mimeType = 'application/pdf';
    else if (ext === '.jpg' || ext === '.jpeg') mimeType = 'image/jpeg';
    else if (ext === '.webp') mimeType = 'image/webp';
    else mimeType = 'image/png';
    base64Data = trimmed;
  }

  if (!ALLOWED_MIME_TYPES[mimeType]) {
    return {
      valid: false,
      error: `Unsupported file format (${mimeType}). Only PNG, JPG, WebP, and PDF files are accepted.`
    };
  }

  let buffer;
  try {
    buffer = Buffer.from(base64Data, 'base64');
  } catch (err) {
    return { valid: false, error: 'Malformed base64 file data.' };
  }

  if (buffer.length < MIN_FILE_SIZE) {
    return { valid: false, error: 'Payment proof file is empty or corrupted (under minimum file size).' };
  }

  if (buffer.length > MAX_FILE_SIZE) {
    return { valid: false, error: 'Payment proof file exceeds maximum 5MB size limit.' };
  }

  // Verify file signatures to prevent spoofing
  const magicMatches = verifyMagicBytes(buffer, mimeType);
  if (!magicMatches) {
    return {
      valid: false,
      error: 'File signature does not match claimed format. Please upload a genuine screenshot or PDF receipt.'
    };
  }

  const ext = ALLOWED_MIME_TYPES[mimeType];
  const safeOriginalName = original_filename
    ? path.basename(original_filename).replace(/[^a-zA-Z0-9_.-]/g, '_')
    : `payment_proof.${ext}`;

  return {
    valid: true,
    buffer,
    mimetype: mimeType,
    ext,
    size: buffer.length,
    original_filename: safeOriginalName
  };
}

/**
 * Stores the validated proof buffer to disk and returns file metadata.
 */
function storePaymentProof(buffer, ext, ref_id, original_filename) {
  const isVercel = Boolean(process.env.VERCEL);
  const uploadDir = isVercel
    ? path.join('/tmp', 'uploads', 'payment_proofs')
    : path.join(__dirname, 'public', 'uploads', 'payment_proofs');

  try {
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    const cleanRef = (ref_id || 'PROMPT').toLowerCase().replace(/[^a-z0-9]/g, '_');
    const storedFilename = `proof_${cleanRef}_${Date.now()}_${Math.floor(Math.random() * 10000)}.${ext}`;
    const absolutePath = path.join(uploadDir, storedFilename);

    fs.writeFileSync(absolutePath, buffer);

    const relativeUrl = `/uploads/payment_proofs/${storedFilename}`;
    const uploadedAt = new Date().toISOString();

    return {
      stored_path: relativeUrl,
      stored_filename: storedFilename,
      original_filename,
      mimetype: Object.keys(ALLOWED_MIME_TYPES).find(m => ALLOWED_MIME_TYPES[m] === ext) || 'image/png',
      size: buffer.length,
      uploaded_at: uploadedAt
    };
  } catch (err) {
    console.warn('[STORAGE] Falling back to inline data URI storage:', err.message);
    const mime = Object.keys(ALLOWED_MIME_TYPES).find(m => ALLOWED_MIME_TYPES[m] === ext) || 'image/png';
    const dataUri = `data:${mime};base64,${buffer.toString('base64')}`;
    return {
      stored_path: dataUri,
      stored_filename: original_filename || `proof_${Date.now()}.${ext}`,
      original_filename,
      mimetype: mime,
      size: buffer.length,
      uploaded_at: new Date().toISOString()
    };
  }
}

/**
 * High-level validator and storage handler.
 */
function handlePaymentValidationAndStorage({ payment_ref, payment_proof, original_filename, ref_id }) {
  const refValidation = validatePaymentRef(payment_ref);
  if (!refValidation.valid) {
    return { success: false, error: refValidation.error };
  }

  const proofValidation = validatePaymentProofPayload(payment_proof, original_filename);
  if (!proofValidation.valid) {
    return { success: false, error: proofValidation.error };
  }

  const stored = storePaymentProof(
    proofValidation.buffer,
    proofValidation.ext,
    ref_id,
    proofValidation.original_filename
  );

  return {
    success: true,
    payment_ref: refValidation.sanitized,
    payment_proof_url: stored.stored_path,
    metadata: {
      proof_filename: stored.original_filename,
      proof_mimetype: proofValidation.mimetype,
      proof_size: stored.size,
      proof_uploaded_at: stored.uploaded_at
    }
  };
}

module.exports = {
  ALLOWED_MIME_TYPES,
  MAX_FILE_SIZE,
  MIN_FILE_SIZE,
  validatePaymentRef,
  verifyMagicBytes,
  validatePaymentProofPayload,
  storePaymentProof,
  handlePaymentValidationAndStorage
};
