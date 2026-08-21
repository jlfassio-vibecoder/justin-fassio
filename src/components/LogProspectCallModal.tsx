import { LogCallFormModal, type LogCallFormModalProps } from '@/components/LogCallFormModal';

type Props = Omit<LogCallFormModalProps, 'mode'>;

/** Prospect / qualified-style records — Log Prospect Call. */
export function LogProspectCallModal(props: Props) {
  return <LogCallFormModal mode="prospect" {...props} />;
}
