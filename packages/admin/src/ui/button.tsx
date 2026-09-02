import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, JSX } from 'react'
import { cn } from './cn.js'

/**
 * The admin's button.
 *
 * Every class the element needs is here, including the ones a browser would
 * normally provide and Tailwind's preflight would normally strip: `theme.css`
 * deliberately does not import preflight (see the comment there), so a bare
 * `<button>` still arrives with a user-agent border, background and padding
 * that these classes have to overwrite explicitly.
 *
 * No `asChild` escape hatch, and therefore no `@radix-ui/react-slot`: a link
 * that should look like a button uses `buttonVariants()` on the `<a>` itself,
 * which is one export rather than one dependency.
 *
 * Pill-shaped (`rounded-full`) per the Nightops v2 register. `primary` carries
 * a faint inset highlight (an alpha-white line, not a colour literal — see
 * the arbitrary shadow value below) on top of `shadow-card`, and every
 * elevated variant lifts a hair (`-translate-y-px`) into `shadow-raised` on
 * hover — the same lift `shell.css` already gives the top-bar buttons.
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 appearance-none cursor-pointer select-none ' +
    'whitespace-nowrap rounded-full border font-sans font-medium leading-none ' +
    'transition-all duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-ring active:scale-[0.97] ' +
    'disabled:pointer-events-none disabled:opacity-60 disabled:cursor-default disabled:active:scale-100',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-primary text-primary-foreground ' +
          'shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18),var(--shadow-card)] ' +
          'hover:-translate-y-px hover:bg-primary/90 ' +
          'hover:shadow-[inset_0_1px_0_0_rgb(255_255_255/0.18),var(--shadow-raised)]',
        secondary:
          'border-border bg-card text-card-foreground shadow-card hover:-translate-y-px ' +
          'hover:border-primary/40 hover:bg-accent hover:text-accent-foreground hover:shadow-raised',
        ghost:
          'border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow-card ' +
          'hover:-translate-y-px hover:bg-destructive/90 hover:shadow-raised',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-9 px-4 text-sm',
        lg: 'h-10 px-5 text-base',
        icon: 'size-9 p-0 text-sm',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
)

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  /**
   * Shows a small spinner in place of the icon slot and marks the control
   * `aria-busy` for assistive tech. Also disables the button — a busy button
   * a second click could re-trigger is the classic double-submit bug — so a
   * caller does not additionally have to pass `disabled` while loading.
   */
  readonly loading?: boolean
}

export function Button({
  className,
  variant,
  size,
  type,
  loading,
  disabled,
  children,
  ...props
}: ButtonProps): JSX.Element {
  // `type` defaults to `"submit"` in HTML, which is a recurring source of
  // buttons that submit a form nobody meant to submit. Defaulting to
  // `"button"` and making submission explicit is the safer way round.
  return (
    <button
      type={type ?? 'button'}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    >
      {loading && <ButtonSpinner className="size-4 shrink-0" />}
      {children}
    </button>
  )
}

/** Inline rather than a dependency (R9) — one glyph, animated with the `animate-spin` utility Tailwind already ships. */
function ButtonSpinner({ className }: { readonly className: string }): JSX.Element {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 20 20"
      className={cn('animate-spin', className)}
      fill="none"
    >
      <circle cx="10" cy="10" r="7.5" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <path
        d="M17.5 10a7.5 7.5 0 0 0-7.5-7.5"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  )
}
