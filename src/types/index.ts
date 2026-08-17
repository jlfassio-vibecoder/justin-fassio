export type TabKey =
  | 'briefing'
  | 'catalog'
  | 'dashboard'
  | 'calls'
  | 'prospects'
  | 'accounts'
  | 'contacts'
  | 'insights'
  | 'messages'
  | 'calendar'
  | 'territories';

/** Represented sales-line slug (picker membership is DB status, not this union). */
export type LineKey = string;

export interface ModalPrefill {
  storeId: number | null;
  channel: string;
  city: string;
}
