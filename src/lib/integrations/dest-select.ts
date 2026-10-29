/** Select value for a Meta/GA4 destination name.
 * `editingCustom` keeps the free-text box open while the user types, even if
 * the text is empty or matches a preset option.
 */
export function destSelectValue(
  current: string,
  options: readonly string[],
  editingCustom = false
): string {
  if (editingCustom) return "__custom__";
  if (!current) return "__none__";
  return options.includes(current) ? current : "__custom__";
}
