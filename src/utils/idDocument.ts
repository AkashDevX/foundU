/** Local ID file chosen during onboarding. Sent as an `id_document_upload` part. */
export type IdDocumentFile = {
  uri: string;
  name: string;
  mime: string;
};

export type IdDocumentDraft = {
  id: string;
  type: string;
  file: IdDocumentFile | null;
  backFile: IdDocumentFile | null;
};

export const MAX_ID_DOCUMENT_BYTES = 15 * 1024 * 1024;

const MIME_BY_EXTENSION: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot >= 0 ? name.slice(dot).toLowerCase() : '';
}

/** Driver's licence rows need a front file and a back file. */
export function isDriversLicenceType(type: string): boolean {
  const value = type.trim().toLowerCase().replace(/[’`]/g, "'");
  return value.includes('driver') && value.includes('licen');
}

export function isIdDocumentImage(mime: string): boolean {
  return mime === 'image/jpeg' || mime === 'image/png';
}

/**
 * Accepts JPG, PNG, PDF, DOC, and DOCX. Empty or generic MIME types are allowed
 * when the file name already has one of those extensions (common on Android).
 */
export function normalizeIdDocument(
  name: string,
  mime: string,
): { name: string; mime: string } | null {
  let fileName = name.trim() || 'id-document';
  let type = mime.toLowerCase().split(';')[0]?.trim() ?? '';
  if (type === 'image/jpg' || type === 'image/pjpeg') {
    type = 'image/jpeg';
  }

  if (!fileName.includes('.')) {
    const match = Object.entries(MIME_BY_EXTENSION).find(([, expected]) => expected === type);
    if (match) {
      fileName += match[0];
    }
  }

  const ext = extensionOf(fileName);
  const canonical = MIME_BY_EXTENSION[ext];
  if (!canonical) {
    return null;
  }

  const mimeOk =
    type === '' ||
    type === 'application/octet-stream' ||
    type === canonical ||
    (ext === '.docx' && (type === 'application/zip' || type === 'application/x-zip-compressed'));
  if (!mimeOk) {
    return null;
  }

  return { name: fileName, mime: canonical };
}

export function createEmptyIdDocument(id: string): IdDocumentDraft {
  return { id, type: '', file: null, backFile: null };
}

export function idDocumentRowIsBlank(doc: IdDocumentDraft): boolean {
  return doc.type.trim() === '' && doc.file === null && doc.backFile === null;
}

export function idDocumentRowIsComplete(doc: IdDocumentDraft): boolean {
  if (doc.type.trim() === '' || doc.file === null) {
    return false;
  }
  if (isDriversLicenceType(doc.type) && doc.backFile === null) {
    return false;
  }
  return true;
}

/** Phrases that fit "Please fill in … before continuing." */
export function idDocumentIssues(docs: IdDocumentDraft[]): string[] {
  const issues: string[] = [];
  const completeCount = docs.filter(idDocumentRowIsComplete).length;
  if (completeCount < 2) {
    issues.push('at least 2 ID documents (type and file for each)');
  }

  let missingFile = false;
  let missingLicenceSides = false;
  let missingType = false;
  for (const doc of docs) {
    if (idDocumentRowIsBlank(doc) || idDocumentRowIsComplete(doc)) {
      continue;
    }
    if (doc.type.trim() === '') {
      missingType = true;
      continue;
    }
    if (isDriversLicenceType(doc.type) && (doc.file === null || doc.backFile === null)) {
      missingLicenceSides = true;
      continue;
    }
    if (doc.file === null) {
      missingFile = true;
    }
  }

  if (missingLicenceSides) {
    issues.push("the front and back of your driver's licence");
  }
  if (missingFile) {
    issues.push('a file for every ID document you started');
  }
  if (missingType) {
    issues.push('an ID type for each document you started');
  }

  return issues;
}

export function summarizeIdDocuments(docs: IdDocumentDraft[]): string {
  return docs
    .filter((doc) => doc.type.trim() !== '')
    .map((doc) => {
      if (isDriversLicenceType(doc.type)) {
        if (doc.file && doc.backFile) {
          return `${doc.type} (front and back uploaded)`;
        }
        if (doc.file || doc.backFile) {
          return `${doc.type} (incomplete)`;
        }
        return doc.type;
      }
      return doc.file ? `${doc.type} (uploaded)` : doc.type;
    })
    .join(' · ');
}
