import { MAX_RESUME_DOCUMENT_BYTES, normalizeResumeDocument } from './resumeDocument';

describe('resume document upload', () => {
  it('accepts pdf, doc, and docx', () => {
    expect(normalizeResumeDocument('Alex Rivera.pdf', 'application/pdf')).toEqual({
      name: 'Alex Rivera.pdf',
      mime: 'application/pdf',
    });
    expect(normalizeResumeDocument('cv.doc', 'application/msword')).toEqual({
      name: 'cv.doc',
      mime: 'application/msword',
    });
    expect(
      normalizeResumeDocument(
        'cv.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      ),
    ).toEqual({
      name: 'cv.docx',
      mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  });

  it('keeps a word file when the device reports a generic or zip mime type', () => {
    expect(normalizeResumeDocument('cv.docx', 'application/octet-stream')?.mime).toBe(
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    );
    expect(normalizeResumeDocument('cv.docx', '')?.name).toBe('cv.docx');
    expect(normalizeResumeDocument('cv.docx', 'application/zip')?.name).toBe('cv.docx');
  });

  it('adds an extension when only the mime type is known', () => {
    expect(normalizeResumeDocument('resume', 'application/pdf')).toEqual({
      name: 'resume.pdf',
      mime: 'application/pdf',
    });
  });

  it('rejects images and other formats', () => {
    expect(normalizeResumeDocument('photo.jpg', 'image/jpeg')).toBeNull();
    expect(normalizeResumeDocument('notes.txt', 'text/plain')).toBeNull();
    expect(normalizeResumeDocument('sheet.xlsx', 'application/vnd.ms-excel')).toBeNull();
  });

  it('caps uploads at 15 MB', () => {
    expect(MAX_RESUME_DOCUMENT_BYTES).toBe(15 * 1024 * 1024);
  });
});
