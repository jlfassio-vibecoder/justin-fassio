import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { AiAssistContext } from '@/lib/aiAssist-context';
import type { AiAssistContextChip, AiAssistPrefill } from '@/lib/aiAssistPrefill';

export function AiAssistProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [chip, setChip] = useState<AiAssistContextChip | null>(null);
  const [composer, setComposer] = useState('');

  const openAssist = useCallback((prefill?: AiAssistPrefill) => {
    if (prefill?.chips) setChip(prefill.chips);
    if (typeof prefill?.draft === 'string') setComposer(prefill.draft);
    setOpen(true);
  }, []);

  const value = useMemo(
    () => ({
      open,
      setOpen,
      chip,
      setChip,
      composer,
      setComposer,
      openAssist,
    }),
    [open, chip, composer, openAssist],
  );

  return <AiAssistContext.Provider value={value}>{children}</AiAssistContext.Provider>;
}
