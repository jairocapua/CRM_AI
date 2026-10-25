/**
 * The time zones the settings forms offer: every one this runtime knows
 * (`Intl.supportedValuesOf`), plus `current` when the list lacks it (an
 * alias such as "Asia/Calcutta" stored before), sorted. An empty `current`
 * adds nothing.
 */
export function timeZoneOptions(current: string): string[] {
  const zones =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : [];
  return current === "" || zones.includes(current)
    ? zones
    : [...zones, current].sort((a, b) => a.localeCompare(b));
}

/** "America/Los_Angeles" as people read it: "America/Los Angeles". */
export function zoneLabel(zone: string): string {
  return zone.replaceAll("_", " ");
}
