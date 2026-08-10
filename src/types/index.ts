export type TabKey =
  | 'catalog'
  | 'dashboard'
  | 'calls'
  | 'prospects'
  | 'accounts'
  | 'contacts'
  | 'insights'
  | 'messages'
  | 'calendar';

export type LineKey = 'ogr' | 'bkg';

export interface ModalPrefill {
  storeId: number | null;
  channel: string;
  city: string;
}
