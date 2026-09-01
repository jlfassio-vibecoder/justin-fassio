import {
  Building2,
  Calendar,
  ClipboardList,
  Gauge,
  Home,
  Lightbulb,
  ListChecks,
  type LucideIcon,
  MessageSquare,
  Package,
  Users,
} from 'lucide-react';
import type { TabKey } from '@/types';

export type StaffTabDef = {
  key: TabKey;
  label: string;
  icon: LucideIcon;
};

/** Shared staff app tab list — used by desktop TabNav and mobile nav drawer. */
export const STAFF_TABS: readonly StaffTabDef[] = [
  { key: 'briefing', label: 'Daily Briefing', icon: ClipboardList },
  { key: 'catalog', label: 'Line Sheet', icon: Package },
  { key: 'dashboard', label: 'PMF Dashboard', icon: Gauge },
  { key: 'calls', label: 'Call Pipeline', icon: ListChecks },
  { key: 'prospects', label: 'Prospect Directory', icon: Home },
  { key: 'accounts', label: 'Active Accounts', icon: Building2 },
  { key: 'contacts', label: 'Contacts', icon: Users },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
  { key: 'calendar', label: 'Calendar', icon: Calendar },
  { key: 'insights', label: 'Buyer Insights', icon: Lightbulb },
] as const;
