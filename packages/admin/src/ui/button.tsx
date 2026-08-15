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
 */
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 appearance-none cursor-pointer select-none ' +
    'whitespace-nowrap rounded-md border font-sans font-medium leading-none ' +
    'transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 ' +
    'focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60 disabled:cursor-default',
  {
    variants: {
      variant: {
        primary:
          'border-transparent bg-primary text-primary-foreground shadow-card hover:bg-primary/90',
        secondary:
          'border-input bg-secondary text-secondary-foreground shadow-card hover:bg-accent hover:text-accent-foreground',
        ghost:
          'border-transparent bg-transparent text-foreground hover:bg-accent hover:text-accent-foreground',
        destructive:
          'border-transparent bg-destructive text-destructive-foreground shadow-card hover:bg-destructive/90',
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
    VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, type, ...props }: ButtonProps): JSX.Element {
  // `type` defaults to `"submit"` in HTML, which is a recurring source of
  // buttons that submit a form nobody meant to submit. Defaulting to
  // `"button"` and making submission explicit is the safer way round.
  return (
    <button
      type={type ?? 'button'}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
