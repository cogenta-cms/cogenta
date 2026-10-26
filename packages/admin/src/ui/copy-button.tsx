import { type JSX, useEffect, useState } from 'react'
import { Button } from './button.js'

export interface CopyButtonProps {
  /** The text put on the clipboard. */
  readonly value: string
  readonly label: string
  /** Shown for two seconds after a successful copy. */
  readonly copiedLabel: string
  readonly size?: 'sm' | 'md'
}

/**
 * A button that copies `value` to the clipboard and says so. Used wherever a
 * secret or an identifier is shown once and has to be transcribed elsewhere —
 * retyping a 40-character key by eye is how it gets mangled.
 */
export function CopyButton({
  value,
  label,
  copiedLabel,
  size = 'sm',
}: CopyButtonProps): JSX.Element {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 2000)
    return () => clearTimeout(timer)
  }, [copied])

  return (
    <Button
      variant="secondary"
      size={size}
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => setCopied(true))
          .catch(() => setCopied(false))
      }}
    >
      <span aria-live="polite">{copied ? copiedLabel : label}</span>
    </Button>
  )
}
