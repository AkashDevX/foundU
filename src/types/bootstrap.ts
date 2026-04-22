/**
 * GET /api/v1/bootstrap — master DB–driven org list + registration picklists.
 */
export type BootstrapCompany = {
  id: number;
  appKey: string | null;
  slug: string;
  name: string;
};

export type PicklistOption = {
  value: string;
  label: string;
};

export type BootstrapPayload = {
  generated_at: string;
  companies: BootstrapCompany[];
  picklists: Record<string, PicklistOption[]>;
};
