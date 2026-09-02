import type {
  InputHTMLAttributes,
  JSX,
  LabelHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from 'react'
import { useId } from 'react'
import { cn } from './cn.js'

/**
 * The admin's form field: a label, a control, an optional description and an
 * optional error, wired to each other the way a screen reader needs.
 *
 * `children` is a function rather than an element because the wiring is the
 * whole point — the id the label points at, the `aria-describedby` that pulls
 * the description and the error into the control's accessible description, and
 * `aria-invalid` — and a render prop hands all three over explicitly instead of
 * guessing at them with `cloneElement`.
 */

const CONTROL_CLASSES =
  'w-full h-10 appearance-none rounded-md border border-input bg-card px-3 font-sans text-sm ' +
  'leading-5 text-card-foreground shadow-card transition-all duration-150 ease-out ' +
  'placeholder:text-muted-foreground ' +
  // Both `focus:` and `focus-visible:` on purpose: a native `<select>` does
  // not reliably get `:focus-visible` in every engine, and a ring the mouse
  // never sees is a control that silently loses its own focus indicator.
  'focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/40 ' +
  'focus-visible:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 ' +
  'aria-invalid:border-destructive disabled:cursor-default disabled:opacity-60'

export interface FieldControlProps {
  readonly id: string
  readonly 'aria-describedby': string | undefined
  readonly 'aria-invalid': true | undefined
}

export interface FieldProps {
  readonly label: ReactNode
  readonly description?: ReactNode
  /** Present means the control is invalid: it is announced and it re-colours the border. */
  readonly error?: string | null
  readonly className?: string
  children(control: FieldControlProps): ReactNode
}

export function Field({ label, description, error, className, children }: FieldProps): JSX.Element {
  const id = useId()
  const descriptionId = description === undefined ? undefined : `${id}-description`
  const errorId = error === undefined || error === null ? undefined : `${id}-error`
  const describedBy = [descriptionId, errorId].filter((value) => value !== undefined).join(' ')

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id}>{label}</Label>
      {children({
        id,
        'aria-describedby': describedBy === '' ? undefined : describedBy,
        'aria-invalid': errorId === undefined ? undefined : true,
      })}
      {description !== undefined && (
        <p id={descriptionId} className="text-xs leading-5 text-muted-foreground">
          {description}
        </p>
      )}
      {errorId !== undefined && (
        // `role="alert"` rather than a silent paragraph: a validation message
        // that only appears visually is invisible to whoever most needs it.
        <p id={errorId} role="alert" className="text-xs leading-5 font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>): JSX.Element {
  return (
    // The control belongs to the caller, not to this component. `Field` above
    // always passes an `htmlFor` that matches the id it hands to `children`,
    // and the "the label resolves to that control" test in
    // `test/ui/components.test.tsx` is what actually proves the association.
    // biome-ignore lint/a11y/noLabelWithoutControl: `Field` makes the association — see just above.
    <label
      className={cn('font-sans text-sm leading-5 font-medium text-foreground', className)}
      {...props}
    />
  )
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return <input className={cn(CONTROL_CLASSES, className)} {...props} />
}

export function Select({
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>): JSX.Element {
  // A native `<select>`, not a listbox built out of divs: it is keyboard- and
  // screen-reader-correct for free, and it is what a phone renders as a native
  // picker. The design system gains nothing real by replacing it.
  return <select className={cn(CONTROL_CLASSES, 'cursor-pointer pr-8', className)} {...props} />
}
