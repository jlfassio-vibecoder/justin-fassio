import { useContext } from 'react';
import { AiAssistContext, type AiAssistApi } from '@/lib/aiAssist-context';

export type { AiAssistApi };

export function useAiAssist(): AiAssistApi {
  const ctx = useContext(AiAssistContext);
  if (!ctx) {
    throw new Error('useAiAssist must be used within AiAssistProvider');
  }
  return ctx;
}
