import {
  createEmptyIdDocument,
  idDocumentIssues,
  idDocumentRowIsComplete,
  isDriversLicenceType,
  normalizeIdDocument,
  summarizeIdDocuments,
  type IdDocumentDraft,
} from './idDocument';

function draft(patch: Partial<IdDocumentDraft> & Pick<IdDocumentDraft, 'id'>): IdDocumentDraft {
  return {
    ...createEmptyIdDocument(patch.id),
    ...patch,
  };
}

const photo = { uri: 'file:///front.jpg', name: 'front.jpg', mime: 'image/jpeg' };
const pdf = { uri: 'file:///back.pdf', name: 'back.pdf', mime: 'application/pdf' };

describe('ID document upload', () => {
  it('accepts images, pdf, and word files', () => {
    expect(normalizeIdDocument('licence.pdf', 'application/pdf')).toEqual({
      name: 'licence.pdf',
      mime: 'application/pdf',
    });
    expect(normalizeIdDocument('front.jpg', 'image/jpeg')).toEqual({
      name: 'front.jpg',
      mime: 'image/jpeg',
    });
    expect(normalizeIdDocument('back.png', 'image/png')).toEqual({
      name: 'back.png',
      mime: 'image/png',
    });
    expect(normalizeIdDocument('id.doc', 'application/msword')).toEqual({
      name: 'id.doc',
      mime: 'application/msword',
    });
    expect(
      normalizeIdDocument(
        'id.docx',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      )?.mime,
    ).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(normalizeIdDocument('id.docx', 'application/zip')?.name).toBe('id.docx');
  });

  it('keeps a file when the device reports a generic mime type', () => {
    expect(normalizeIdDocument('scan.pdf', 'application/octet-stream')).toEqual({
      name: 'scan.pdf',
      mime: 'application/pdf',
    });
    expect(normalizeIdDocument('photo.jpeg', '')).toEqual({
      name: 'photo.jpeg',
      mime: 'image/jpeg',
    });
    expect(normalizeIdDocument('camera', 'image/jpg')).toEqual({
      name: 'camera.jpg',
      mime: 'image/jpeg',
    });
  });

  it('rejects other formats', () => {
    expect(normalizeIdDocument('notes.txt', 'text/plain')).toBeNull();
    expect(normalizeIdDocument('scan.heic', 'image/heic')).toBeNull();
  });

  it('recognises a driver licence type', () => {
    expect(isDriversLicenceType("Driver's Licence")).toBe(true);
    expect(isDriversLicenceType('Drivers License')).toBe(true);
    expect(isDriversLicenceType('Passport')).toBe(false);
  });

  it('requires front and back only for a driver licence', () => {
    const licence = draft({ id: '1', type: "Driver's Licence", file: photo });
    const passport = draft({ id: '2', type: 'Passport', file: pdf });
    expect(idDocumentRowIsComplete(licence)).toBe(false);
    expect(idDocumentRowIsComplete({ ...licence, backFile: pdf })).toBe(true);
    expect(idDocumentRowIsComplete(passport)).toBe(true);
    expect(idDocumentIssues([licence, passport])).toEqual([
      'at least 2 ID documents (type and file for each)',
      "the front and back of your driver's licence",
    ]);
    expect(idDocumentIssues([{ ...licence, backFile: photo }, passport])).toEqual([]);
  });

  it('summarises uploaded sides', () => {
    expect(
      summarizeIdDocuments([
        draft({ id: '1', type: "Driver's Licence", file: photo, backFile: pdf }),
        draft({ id: '2', type: 'Medicare', file: photo }),
      ]),
    ).toBe("Driver's Licence (front and back uploaded) · Medicare (uploaded)");
  });
});
