import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

/**
 * The one class-name joiner every component in this folder uses.
 *
 * `clsx` flattens the conditional forms (arrays, objects, `false`), and
 * `twMerge` resolves Tailwind conflicts so that a caller's `className` actually
 * wins. Without the second half, `<Button className="bg-destructive">` would
 * emit both `bg-primary` and `bg-destructive` and the winner would be decided
 * by which rule Tailwind happened to emit later in the stylesheet — not by the
 * order in the attribute. That is the whole reason shadcn/ui ships a `cn()`
 * rather than a template string, and it is why both packages are worth their
 * (dependency-free, single-digit-kilobyte) weight under R9.
 */
export function cn(...inputs: readonly ClassValue[]): string {
  return twMerge(clsx(inputs))
}
