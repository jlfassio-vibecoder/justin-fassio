export type TabKey =
  'catalog' | 'dashboard' | 'calls' | 'prospects' | 'accounts' | 'contacts' | 'insights';

export type LineKey = 'ogr' | 'bkg';

export interface ModalPrefill {
  storeId: number | null;
  channel: string;
  city: string;
}
