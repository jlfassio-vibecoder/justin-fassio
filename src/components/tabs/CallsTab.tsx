import { ListChecks, Plus } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { Card, CardTitle } from '@/components/ui/Card';
import { Input, Select } from '@/components/ui/Input';

interface CallsTabProps {
  onLogCall: () => void;
}

export function CallsTab({ onLogCall }: CallsTabProps) {
  return (
    <section className="flex flex-col gap-5" data-screen-label="calls">
      <Card row className="flex-wrap items-center gap-3">
        <Input
          className="min-w-[220px] flex-1"
          placeholder="Search calls by store, contact, notes…"
        />
        <Select className="w-auto">
          <option>All Retail Channels</option>
          <option>Golf Pro Shops</option>
          <option>Marinas</option>
          <option>Hardware / Farm Co-op</option>
          <option>Resort Gift</option>
        </Select>
        <Select className="w-auto">
          <option>All Call Outcomes</option>
          <option>Closed PO</option>
          <option>Sample Requested</option>
          <option>Follow-up Scheduled</option>
          <option>Gatekeeper</option>
          <option>Not Interested</option>
        </Select>
        <Button variant="primary" onClick={onLogCall}>
          <Plus size={16} strokeWidth={2.75} />
          <span>Log New Call</span>
        </Button>
      </Card>

      <Card elevation="md" className="items-center gap-3 px-5 py-14 text-center">
        <ListChecks size={36} strokeWidth={2.75} className="text-sage-500" />
        <CardTitle className="text-[19px]">Your pipeline is empty</CardTitle>
        <p className="max-w-[46ch] text-[13px] opacity-70">
          Every call you log — outcome, PMF score, buyer feedback, order value — will build your
          pipeline here, searchable and filterable by channel and outcome.
        </p>
        <Button variant="primary" onClick={onLogCall} className="mt-1">
          Log New Call
        </Button>
      </Card>
    </section>
  );
}
