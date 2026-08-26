import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';

export type ManualSourceLockFieldsProps = {
  hint: string;
  placeholder: string;
  ariaLabel: string;
  value: string;
  disabled: boolean;
  locking: boolean;
  onChange: (value: string) => void;
  onLock: () => void;
};

export function ManualSourceLockFields({
  hint,
  placeholder,
  ariaLabel,
  value,
  disabled,
  locking,
  onChange,
  onLock,
}: ManualSourceLockFieldsProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink/55 m-0 text-xs">{hint}</p>
      <Input
        type="url"
        inputMode="url"
        placeholder={placeholder}
        aria-label={ariaLabel}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      />
      <div>
        <Button
          type="button"
          variant="primary"
          disabled={disabled || !value.trim()}
          onClick={onLock}
        >
          {locking ? 'Locking…' : 'Lock in'}
        </Button>
      </div>
    </div>
  );
}
