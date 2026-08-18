import type { PrimaryRetailChannel } from '@/lib/crmRetailTaxonomy';
import type {
  AccountImportMatchDecision,
  AccountImportSourceType,
  LineAccountMarker,
  RelationshipStatus,
} from '@/types/database';

export const ACCOUNT_IMPORT_TARGET_FIELDS = [
  'businessName',
  'shipTo',
  'street',
  'city',
  'state',
  'postalCode',
  'formerRepCode',
  'storeType',
  'contactName',
  'email',
  'phone',
  'website',
  'externalId',
] as const;

export type AccountImportTargetField = (typeof ACCOUNT_IMPORT_TARGET_FIELDS)[number];

export type AccountImportColumnMap = Partial<Record<AccountImportTargetField, string>>;

export type ParsedWorkbook = {
  headers: string[];
  rows: Record<string, string>[];
  sheetName: string;
};

export type ParsedAddress = {
  street: string | null;
  city: string | null;
  stateRaw: string | null;
  stateCode: 'or' | 'wa' | null;
  postalCode: string | null;
  postal5: string | null;
  uncertain: boolean;
  suggestedStateCode: 'or' | 'wa' | null;
  warnings: string[];
};

export type NormalizedImportRow = {
  rowNumber: number;
  raw: Record<string, string>;
  name: string;
  nameNormalized: string;
  street: string | null;
  city: string | null;
  stateCode: 'or' | 'wa' | null;
  region: 'Oregon' | 'Washington' | null;
  postalCode: string | null;
  postal5: string | null;
  formerRepCode: string | null;
  storeTypeRaw: string | null;
  category: PrimaryRetailChannel;
  contactName: string | null;
  email: string | null;
  emailImportable: boolean;
  phone: string | null;
  website: string | null;
  externalId: string | null;
  rawAddressText: string;
  addressUncertain: boolean;
  fingerprint: string | null;
  warnings: string[];
};

export type CollapsedImportRow = NormalizedImportRow & {
  inFileDuplicateOf: number | null;
  collapsedFromRowNumbers: number[];
};

export type PreviewMatch = {
  retailerId: number;
  name: string;
  city: string;
  territoryCode: string | null;
  accountStatus: string;
  relationshipStatus: string | null;
  markers: LineAccountMarker[];
};

export type PreviewImportRow = CollapsedImportRow & {
  matchDecision: AccountImportMatchDecision;
  match: PreviewMatch | null;
  blockingErrors: string[];
  proposedClassification: {
    relationshipStatus: RelationshipStatus;
    markers: LineAccountMarker[];
    existingOgr: 'yes';
    importProtected: true;
    qualificationStatus: 'reactivation';
  };
};

export type PreviewCounts = {
  uploadedRows: number;
  uniqueBusinesses: number;
  duplicateSpreadsheetRows: number;
  existingRecordsLinked: number;
  newRetailersProposed: number;
  lineAccountsProposed: number;
  contactsProposed: number;
  rowsRequiringReview: number;
  blockedRows: number;
};

export type ConfirmClassification = {
  relationshipStatus: RelationshipStatus;
  markers: LineAccountMarker[];
  existingOgr: string;
  nextAction: string | null;
};

export type AccountImportSourceOption = {
  value: AccountImportSourceType;
  label: string;
  enabled: boolean;
};
