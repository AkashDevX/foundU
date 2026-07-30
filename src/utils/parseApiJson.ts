/**
 * Parse JSON from an API response body that may include server-side noise
 * (e.g. LiteSpeed prepending `<!--text/x-generic ...-->` before JSON).
 */
export function parseApiJson(text: string): unknown {
  let body = text;
  if (body.charCodeAt(0) === 0xfeff) {
    body = body.slice(1);
  }
  body = body.trimStart();

  while (body.startsWith('<!--')) {
    const end = body.indexOf('-->');
    if (end === -1) break;
    body = body.slice(end + 3).trimStart();
  }

  const jsonStart = body.search(/[{[]/);
  if (jsonStart > 0) {
    body = body.slice(jsonStart);
  }

  return JSON.parse(body);
}

export function tryParseApiJson(text: string): unknown | null {
  try {
    return parseApiJson(text);
  } catch {
    return null;
  }
}
