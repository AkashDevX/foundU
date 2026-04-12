/**
 * Keep in sync with `MainTabs.tsx` floating pill (`tabBar` + `tabBarOuter` bottom offset).
 * `minHeight: 72` is a floor; real height is driven by icons + labels + nested padding (~100).
 */
export const FLOATING_TAB_BAR_BOTTOM_INSET = 20;
export const FLOATING_TAB_PILL_HEIGHT = 100;
/** Breathing room between screen content (e.g. chat composer) and top of the tab pill */
export const FLOATING_TAB_GAP_ABOVE_PILL = 20;

export function floatingTabBarClearance(insetsBottom: number): number {
  return Math.max(insetsBottom, FLOATING_TAB_BAR_BOTTOM_INSET) + FLOATING_TAB_PILL_HEIGHT + FLOATING_TAB_GAP_ABOVE_PILL;
}
