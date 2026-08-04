import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/cn';

export type RowActionItem = {
  id: string;
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  disabledReason?: string;
};

export type RowActionSection = {
  id: string;
  label: string;
  items: RowActionItem[];
};

interface RowActionsMenuProps {
  label: string;
  sections: RowActionSection[];
  className?: string;
}

type MenuPosition = { top: number; left: number; openUp: boolean };

function flatEnabledItems(sections: RowActionSection[]): RowActionItem[] {
  return sections.flatMap((s) => s.items).filter((item) => !item.disabled);
}

export function RowActionsMenu({ label, sections, className }: RowActionsMenuProps) {
  const menuId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const enabledItems = flatEnabledItems(sections);

  const close = useCallback(() => {
    setOpen(false);
    setPosition(null);
    triggerRef.current?.focus();
  }, []);

  const updatePosition = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const menuHeight = menuRef.current?.offsetHeight ?? 240;
    const spaceBelow = window.innerHeight - rect.bottom;
    const openUp = spaceBelow < menuHeight + 8 && rect.top > spaceBelow;
    setPosition({
      top: openUp ? rect.top - 4 : rect.bottom + 4,
      left: Math.min(rect.right, window.innerWidth - 8),
      openUp,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition, sections]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      close();
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        close();
      }
    }

    function onReposition() {
      updatePosition();
    }

    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onReposition);
      window.removeEventListener('scroll', onReposition, true);
    };
  }, [open, close, updatePosition]);

  useEffect(() => {
    if (!open || !position) return;
    const first = menuRef.current?.querySelector<HTMLElement>(
      '[role="menuitem"]:not([aria-disabled="true"])',
    );
    first?.focus();
  }, [open, position]);

  function focusItem(index: number) {
    if (enabledItems.length === 0) return;
    const next = ((index % enabledItems.length) + enabledItems.length) % enabledItems.length;
    setActiveIndex(next);
    menuRef.current
      ?.querySelector<HTMLElement>(`[data-action-id="${enabledItems[next].id}"]`)
      ?.focus();
  }

  function onMenuKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      focusItem(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      focusItem(activeIndex - 1);
    } else if (event.key === 'Home') {
      event.preventDefault();
      focusItem(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      focusItem(enabledItems.length - 1);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  }

  const menu =
    open && position
      ? createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            tabIndex={-1}
            onKeyDown={onMenuKeyDown}
            className="border-ink/15 bg-surface fixed z-50 min-w-[220px] rounded-md border py-1 shadow-lg"
            style={{
              top: position.openUp ? undefined : position.top,
              bottom: position.openUp ? window.innerHeight - position.top : undefined,
              left: position.left,
              transform: 'translateX(-100%)',
            }}
          >
            {sections.map((section) => (
              <div key={section.id} role="group" aria-label={section.label}>
                <p className="text-ink/50 m-0 px-3 pt-2 pb-1 text-[10px] tracking-wider uppercase">
                  {section.label}
                </p>
                {section.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitem"
                    data-action-id={item.id}
                    disabled={item.disabled}
                    aria-disabled={item.disabled || undefined}
                    title={item.disabled ? item.disabledReason : undefined}
                    className={cn(
                      'font-body text-ink block w-full px-3 py-2 text-left text-sm',
                      item.disabled
                        ? 'cursor-not-allowed opacity-45'
                        : 'hover:bg-ink/[0.07] focus:bg-ink/[0.07] focus:outline-none',
                    )}
                    onClick={() => {
                      if (item.disabled) return;
                      item.onSelect();
                      close();
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            ))}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className={cn('inline-flex', className)}>
      <button
        ref={triggerRef}
        type="button"
        className="font-heading border-ink/15 hover:bg-ink/[0.07] active:bg-ink/[0.14] inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md border text-sm leading-tight transition-colors disabled:cursor-not-allowed disabled:opacity-45"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation();
          setActiveIndex(0);
          setOpen((prev) => !prev);
        }}
      >
        <MoreHorizontal size={16} strokeWidth={2.75} aria-hidden />
      </button>
      {menu}
    </div>
  );
}
