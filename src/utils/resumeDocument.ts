/** Local resume chosen during onboarding. Sent as the `resume` multipart part. */
export type ResumeDocumentUpload = {
  uri: string;
  name: string;
  mime: string;
};

export const MAX_RESUME_DOCUMENT_BYTES = 15 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/**
 * Accepts PDF, DOC, and DOCX. Empty or generic MIME types are allowed when the
 * file name already has one of those extensions (common on Android).
 */
export function normalizeResumeDocument(
  name: string,
  mime: string,
): { name: string; mime: string } | null {
  let fileName = name.trim() || 'resume';
  const type = mime.toLowerCase().split(';')[0]?.trim() ?? '';

  if (!fileName.includes('.')) {
    const match = Object.entries(MIME_BY_EXTENSION).find(([, expected]) => expected === type);
    if (match) {
      fileName += match[0];
    }
  }

  const ext = extensionOf(fileName);
  const expected = MIME_BY_EXTENSION[ext];
  if (!expected) {
    return null;
  }

  const mimeOk =
    type === '' ||
    type === 'application/octet-stream' ||
    type === expected ||
    (ext === '.docx' && (type === 'application/zip' || type === 'application/x-zip-compressed'));

  if (!mimeOk) {
    return null;
  }

  return { name: fileName, mime: expected };
}
