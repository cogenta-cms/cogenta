import { type ChangeEvent, type InputHTMLAttributes, type JSX, useRef, useState } from 'react'
import { buttonVariants } from './button.js'
import { cn } from './cn.js'

export interface FileButtonProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'children' | 'value' | 'size'> {
  /** The visible button text, already translated ("Choisir un fichier"). */
  readonly label: string
  /** Shown beside the button until a file is chosen ("Aucun fichier choisi"). */
  readonly emptyLabel: string
  readonly size?: 'sm' | 'md'
}

/**
 * A file picker in the admin's language.
 *
 * The native `<input type="file">` draws its own "Choose File / No file
 * chosen" text from the browser's UI locale, not from the page's, so on a
 * French admin it reads English. This keeps the real input (visually hidden,
 * still focusable and labelled by the caller's `Field`/`aria-label`) and
 * draws a button plus the chosen file name from translated strings. Pass the
 * input's `id` / `aria-*` through the rest props exactly as with an `<input>`.
 */
export function FileButton({
  label,
  emptyLabel,
  size = 'md',
  className,
  onChange,
  disabled,
  ...rest
}: FileButtonProps): JSX.Element {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState<string | null>(null)

  function handleChange(event: ChangeEvent<HTMLInputElement>): void {
    setFileName(event.target.files?.[0]?.name ?? null)
    onChange?.(event)
  }

  return (
    <span className={cn('flex flex-wrap items-center gap-3', className)}>
      <input
        {...rest}
        ref={inputRef}
        type="file"
        disabled={disabled}
        onChange={handleChange}
        className="peer sr-only"
      />
      <button
        type="button"
        disabled={disabled}
        tabIndex={-1}
        aria-hidden="true"
        onClick={() => inputRef.current?.click()}
        className={cn(
          buttonVariants({ variant: 'secondary', size }),
          'peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ring',
        )}
      >
        {label}
      </button>
      <span className="min-w-0 break-all text-muted-foreground text-sm">
        {fileName ?? emptyLabel}
      </span>
    </span>
  )
}
