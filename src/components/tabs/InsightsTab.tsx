import { Card, CardBody, CardTitle } from '@/components/ui/Card';

interface InsightsTabProps {
  marginRangeDisplay: string;
}

export function InsightsTab({ marginRangeDisplay }: InsightsTabProps) {
  return (
    <section className="flex flex-col gap-5" data-screen-label="insights">
      <Card>
        <CardTitle className="text-base">Buyer Reaction Cloud</CardTitle>
        <p className="mt-1 text-[13px] opacity-70">
          Feedback tags will collect here as calls are logged — spot recurring objections and wins at a glance.
        </p>
      </Card>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(280px,1fr))] gap-4">
        <Card>
          <CardTitle className="text-[15px] text-accent-700">Objection: "Our budget is already pre-booked"</CardTitle>
          <CardBody>
            Ship in 72 hours from Vista, CA with flexible 24-piece minimums. Offer a low-risk test order or a
            Father's Day impulse display tray so the buyer isn't waiting on next season's plan.
          </CardBody>
        </Card>
        <Card>
          <CardTitle className="text-[15px] text-accent-700">Objection: "We need bigger margin to cover FX"</CardTitle>
          <CardBody>
            Suggested CAD MSRP pricing already delivers a keystone margin in the {marginRangeDisplay} range on
            standard USD wholesale — walk the buyer through the landed-cost math live on the call.
          </CardBody>
        </Card>
        <Card>
          <CardTitle className="text-[15px] text-accent-700">Objection: "Never heard of this brand"</CardTitle>
          <CardBody>
            Lead with the category fit reason from the prospect record — most matches were sourced from a real store
            visit or regional research, not a cold list.
          </CardBody>
        </Card>
      </div>
    </section>
  );
}
