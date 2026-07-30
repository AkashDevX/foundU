/**
 * Keep in sync with `MainTabs.tsx` floating dock (`dock` + `tabBarOuter` bottom offset).
 * Dock minHeight ~72 plus shadow breathing room.
 */
export const FLOATING_TAB_BAR_BOTTOM_INSET = 18;
export const FLOATING_TAB_PILL_HEIGHT = 84;
/** Breathing room between screen content (e.g. chat composer) and top of the tab dock */
export const FLOATING_TAB_GAP_ABOVE_PILL = 18;

export function floatingTabBarClearance(insetsBottom: number): number {
  return Math.max(insetsBottom, FLOATING_TAB_BAR_BOTTOM_INSET) + FLOATING_TAB_PILL_HEIGHT + FLOATING_TAB_GAP_ABOVE_PILL;
}
