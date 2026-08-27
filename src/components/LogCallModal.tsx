import { LogAccountCallModal } from '@/components/LogAccountCallModal';
import { LogProspectCallModal } from '@/components/LogProspectCallModal';
import type { BriefingLogCallContext } from '@/components/LogCallFormModal';
import type { CatalogItem } from '@/lib/catalog';
import { resolveLogCallMode } from '@/lib/logCallCatalogs';
import type { Prospect } from '@/lib/prospects';

interface LogCallModalProps {
  open: boolean;
  prospects: Prospect[];
  storeId: number | null;
  catalog?: CatalogItem[];
  briefingContext?: BriefingLogCallContext | null;
  onClose: () => void;
  onStoreChange: (id: number | null) => void;
  onSaved?: () => void;
  onConverted?: () => void;
  onRetailerUpdated?: () => void;
  onContactCreated?: () => void;
  activityHistoryReloadToken?: number;
}

/**
 * Router: account mode for active_account / inactive; prospect mode otherwise.
 * When no store is selected yet, defaults to prospect shell until a record is chosen.
 */
export function LogCallModal({
  open,
  prospects,
  storeId,
  catalog,
  briefingContext = null,
  onClose,
  onStoreChange,
  onSaved,
  onConverted,
  onRetailerUpdated,
  onContactCreated,
  activityHistoryReloadToken,
}: LogCallModalProps) {
  const selected = storeId != null ? prospects.find((p) => p.id === storeId) : undefined;
  const mode = resolveLogCallMode(selected?.accountStatus);
  const shared = {
    open,
    prospects,
    storeId,
    catalog,
    briefingContext,
    onClose,
    onStoreChange,
    onSaved,
    onConverted,
    onRetailerUpdated,
    onContactCreated,
    activityHistoryReloadToken,
  };

  if (mode === 'account') {
    return <LogAccountCallModal {...shared} />;
  }
  return <LogProspectCallModal {...shared} />;
}
