import type { TFunction } from 'i18next'

/**
 * The name an account role is shown under: the translated label when the
 * admin knows the role (`roles.<name>`), the raw name otherwise — a role a
 * site invented for itself is a string only that site can name.
 */
export function roleLabel(t: TFunction, role: string): string {
  return t(`roles.${role}`, { defaultValue: role })
}

/** The roles as a comma-separated list of labels, for sentences and table cells. */
export function roleLabels(t: TFunction, roles: readonly string[]): string {
  return roles.map((role) => roleLabel(t, role)).join(', ')
}
