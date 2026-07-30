/**
 * Map preview uses OpenStreetMap — no API key or billing.
 *
 * 1) Try the public static-map image (with a proper User-Agent; direct <Image> URLs often fail).
 * 2) If that fails, fetch a single map tile + show a pin overlay in the UI.
 *
 * Data © OpenStreetMap contributors — keep attribution in the UI.
 * https://www.openstreetmap.org/copyright
 *
 * Tile policy: https://operations.osmfoundation.org/policies/tiles/
 */

const USER_AGENT = 'CruLynkApp/1.0 (contact via app publisher)';

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

async function fetchImageAsDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'image/png,image/webp,image/jpeg,image/*,*/*;q=0.8',
      },
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    if (buf.byteLength < 80) return null;
    const ct = res.headers.get('content-type') ?? '';
    const looksHtml = ct.includes('text/html') || ct.includes('text/plain');
    if (looksHtml) return null;
    const base64 = arrayBufferToBase64(buf);
    const mime = ct.includes('jpeg') ? 'image/jpeg' : 'image/png';
    return `data:${mime};base64,${base64}`;
  } catch {
    return null;
  }
}

/** Public static map (FOSSGIS) — use only via fetch + data URI, not raw Image uri */
export function buildOpenStreetMapStaticMapUrl(lat: number, lng: number): string {
  const center = `${lat},${lng}`;
  const params = new URLSearchParams({
    center,
    zoom: '16',
    size: '640x320',
    markers: `${lat},${lng},red-pushpin`,
  });
  return `https://staticmap.openstreetmap.de/staticmap.php?${params.toString()}`;
}

export function latLngToTileXY(lat: number, lng: number, zoom: number): { x: number; y: number } {
  const n = 2 ** zoom;
  const x = Math.floor(((lng + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n
  );
  return { x, y };
}

export function buildOsmTileUrl(z: number, x: number, y: number): string {
  return `https://tile.openstreetmap.org/${z}/${x}/${y}.png`;
}

export type MapPreviewResult = {
  uri: string;
  mode: 'static' | 'tile';
};

/**
 * Loads a preview image as a data URI (works when anonymous Image requests are blocked).
 * Tries static map first, then a single zoom-17 tile as fallback.
 */
export async function loadOpenStreetMapPreview(lat: number, lng: number): Promise<MapPreviewResult | null> {
  const staticUrl = buildOpenStreetMapStaticMapUrl(lat, lng);
  const staticData = await fetchImageAsDataUri(staticUrl);
  if (staticData) {
    return { uri: staticData, mode: 'static' };
  }

  const z = 17;
  const { x, y } = latLngToTileXY(lat, lng, z);
  const tileUrl = buildOsmTileUrl(z, x, y);
  const tileData = await fetchImageAsDataUri(tileUrl);
  if (tileData) {
    return { uri: tileData, mode: 'tile' };
  }

  return null;
}
