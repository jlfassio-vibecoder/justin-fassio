import { createContext } from 'react';
import type { AiAssistContextChip, AiAssistPrefill } from '@/lib/aiAssistPrefill';

export type AiAssistApi = {
  open: boolean;
  setOpen: (open: boolean) => void;
  chip: AiAssistContextChip | null;
  setChip: (chip: AiAssistContextChip | null) => void;
  composer: string;
  setComposer: (text: string) => void;
  openAssist: (prefill?: AiAssistPrefill) => void;
};

export const AiAssistContext = createContext<AiAssistApi | null>(null);
