/** Normalize HeroUI string changes and native input events at the field boundary. */
export function fieldValue(valueOrEvent) {
  return typeof valueOrEvent === 'string'
    ? valueOrEvent
    : valueOrEvent?.target?.value ?? '';
}
