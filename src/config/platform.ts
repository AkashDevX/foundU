/**
 * CruLynk platform identifier for master-registry routes that must not be scoped
 * to a tenant organization (e.g. new organisation access requests).
 *
 * Backend: store and surface these requests only in the CruLynk platform admin UI —
 * never in individual employer tenant dashboards.
 */
export const CRULYNK_PLATFORM_SLUG = 'crulynk';
