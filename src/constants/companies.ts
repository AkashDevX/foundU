/**
 * Organizations using the app. Replace or hydrate from your API when ready.
 */
export type Company = {
  id: string;
  name: string;
};

export const COMPANIES: Company[] = [
  { id: 'org-demo', name: 'Blue Green Facility Services' },
  { id: 'org-retail', name: 'Aid & able Services' },
  { id: 'org-health', name: 'Construct Concepts' },
  { id: 'org-logistics', name: 'Found U' },
];

export function getCompanyNameById(id: string | null | undefined): string | null {
  if (!id) return null;
  return COMPANIES.find((c) => c.id === id)?.name ?? null;
}
