export type GmailLabelFilter = 'INBOX' | 'SENT' | 'DRAFT';

export type GmailThreadSummary = {
  id: string;
  subject: string;
  snippet: string;
  from: string;
  to: string;
  date: string | null;
  unread: boolean;
};

export type GmailAttachmentMeta = {
  filename: string;
  mimeType: string;
  size: number;
  attachmentId: string | null;
};

export type GmailMessageView = {
  id: string;
  from: string;
  to: string;
  cc: string;
  date: string | null;
  subject: string;
  bodyText: string;
  bodyHtml: string | null;
  attachments: GmailAttachmentMeta[];
};

export type GmailThreadDetail = {
  id: string;
  subject: string;
  snippet: string;
  unread: boolean;
  messages: GmailMessageView[];
};

export type GmailThreadListResult = {
  threads: GmailThreadSummary[];
  nextPageToken: string | null;
  resultSizeEstimate: number | null;
};
