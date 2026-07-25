import { parseApiJson, tryParseApiJson } from '../src/utils/parseApiJson';

describe('parseApiJson', () => {
  it('parses plain JSON', () => {
    expect(parseApiJson('{"ok":true}')).toEqual({ ok: true });
  });

  it('strips LiteSpeed HTML comment prefix before JSON', () => {
    const raw =
      '<!--text/x-generic database.php ( PHP script, UTF-8 Unicode text )-->\n' +
      '{"companies":[{"slug":"demo","name":"Demo"}]}';
    expect(parseApiJson(raw)).toEqual({ companies: [{ slug: 'demo', name: 'Demo' }] });
  });

  it('strips BOM and leading whitespace', () => {
    expect(parseApiJson('\uFEFF  {"a":1}')).toEqual({ a: 1 });
  });

  it('tryParseApiJson returns null on invalid input', () => {
    expect(tryParseApiJson('not json')).toBeNull();
  });
});
