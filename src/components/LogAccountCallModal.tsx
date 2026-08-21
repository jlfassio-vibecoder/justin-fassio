import { LogCallFormModal, type LogCallFormModalProps } from '@/components/LogCallFormModal';

type Props = Omit<LogCallFormModalProps, 'mode'>;

/** Active / inactive operational accounts — Log Call. */
export function LogAccountCallModal(props: Props) {
  return <LogCallFormModal mode="account" {...props} />;
}
