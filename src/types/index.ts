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
  | 'calendar';

/** Represented sales lines in the Phase 2 picker (excludes bkg / prospective). */
export type LineKey = 'ogr' | 'eagle-peak' | 'big-fish';

export interface ModalPrefill {
  storeId: number | null;
  channel: string;
  city: string;
}
