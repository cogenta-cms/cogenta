import { type InputHTMLAttributes, type JSX, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { EyeIcon, EyeOffIcon } from '../ui/icons.js'
import { cn, Input } from '../ui/index.js'

/**
 * A password field with a show/hide toggle — the one affordance every password
 * screen of a modern admin has, and the cure for retyping a 12-character
 * passphrase blind. The toggle is a real button (not a decoration on the
 * input), announces its state with `aria-pressed`, and never takes part in the
 * form's own submit.
 */
export function PasswordInput({
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>): JSX.Element {
  const { t } = useTranslation()
  const [shown, setShown] = useState(false)
  const Icon = shown ? EyeOffIcon : EyeIcon
  return (
    <div className="relative">
      <Input {...props} type={shown ? 'text' : 'password'} className={cn('pr-11', className)} />
      <button
        type="button"
        aria-pressed={shown}
        aria-label={shown ? t('auth.hidePassword') : t('auth.showPassword')}
        title={shown ? t('auth.hidePassword') : t('auth.showPassword')}
        onClick={() => setShown((current) => !current)}
        className="absolute top-1/2 right-1.5 flex size-8 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
      >
        <Icon className="size-4" />
      </button>
    </div>
  )
}
