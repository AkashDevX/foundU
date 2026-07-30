/** True when value is null, undefined, or whitespace-only. */
export function isBlank(value: string | null | undefined): boolean {
  return value == null || String(value).trim() === '';
}

export type MissingFieldsAlert = {
  message: string;
  listItems?: string[];
};

/** Builds intro text + optional bullet list for SweetAlert missing-field errors. */
export function missingFieldsAlert(fields: string[]): MissingFieldsAlert {
  if (fields.length === 0) return { message: '' };
  if (fields.length === 1) {
    return { message: `Please fill in ${fields[0]} before continuing.` };
  }
  return {
    message: `Please complete the following ${fields.length} required fields:`,
    listItems: fields,
  };
}
