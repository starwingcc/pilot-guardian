import { useState, type ComponentProps } from 'react'
import { EyeIcon, EyeOffIcon } from 'lucide-react'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from '@/src/components/ui/input-group'
import { cn } from '@/src/lib/utils'

type PasswordInputProps = Omit<ComponentProps<typeof InputGroupInput>, 'type'>

export function PasswordInput({ className, id, ...props }: PasswordInputProps) {
  const [revealed, setRevealed] = useState(false)
  const toggleLabel = revealed ? '隐藏口令' : '显示口令'

  return (
    <InputGroup>
      <InputGroupInput
        {...props}
        id={id}
        type="text"
        inputMode="text"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        data-masked={!revealed}
        className={cn('password-input', className)}
      />
      <InputGroupAddon align="inline-end">
        <InputGroupButton
          className="password-visibility-toggle"
          size="icon-xs"
          aria-label={toggleLabel}
          aria-controls={id}
          aria-pressed={revealed}
          title={toggleLabel}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => setRevealed((current) => !current)}
        >
          {revealed
            ? <EyeOffIcon data-icon="inline-start" aria-hidden="true" />
            : <EyeIcon data-icon="inline-start" aria-hidden="true" />}
        </InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  )
}
