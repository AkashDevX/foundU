/**
 * OpenStreetMap Nominatim — search (forward geocoding) for address autocomplete.
 * Same service family as reverse geocode used elsewhere; follow usage policy:
 * https://operations.osmfoundation.org/policies/nominatim/
 * (identify app via User-Agent, debounce client-side, avoid burst requests)
 */

const USER_AGENT = 'CruLynkApp/1.0';

export type AddressSuggestion = {
  placeId: number;
  displayName: string;
  lat: string;
  lon: string;
};

type NominatimSearchJson = {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
};

export async function searchAddressSuggestions(query: string): Promise<AddressSuggestion[]> {
  const q = query.trim();
  if (q.length < 3) return [];

  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    q,
  )}&format=json&addressdetails=1&limit=8`;

  const res = await fetch(url, {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
  });

  if (!res.ok) return [];

  const data = (await res.json()) as NominatimSearchJson[];
  if (!Array.isArray(data)) return [];

  return data.map((item) => ({
    placeId: item.place_id,
    displayName: item.display_name,
    lat: item.lat,
    lon: item.lon,
  }));
}
