import {
  Badge,
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@smartreach/ui";
import { MIN_SENDS_TO_CALL, formatRate, type VariantStepSummary } from "@/lib/variant-stats";

function stepName(position: number): string {
  return position <= 1 ? "First email" : `Follow-up ${position - 1}`;
}

/** Per-step A/B results on the Sequence tab. Renders nothing until a step has two versions with sends. */
export function VariantResults({ steps }: { steps: VariantStepSummary[] }) {
  if (steps.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Variant results</CardTitle>
        <CardDescription>
          Leads who got each version, and how many opened or replied after it. Reply rate counts replies that came in
          after that email.
        </CardDescription>
      </CardHeader>
      <div className="mt-4 flex flex-col gap-5 pb-5">
        {steps.map((step) => (
          <section key={step.stepPosition} aria-label={stepName(step.stepPosition)} className="flex flex-col gap-2">
            <h4 className="px-5 text-[13px] font-medium text-foreground">{stepName(step.stepPosition)}</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Variant</TableHead>
                  <TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Open rate</TableHead>
                  <TableHead className="text-right">Reply rate</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {step.variants.map((v) => (
                  <TableRow key={v.variantId}>
                    <TableCell>
                      <span className="inline-flex flex-wrap items-center gap-2">
                        <span className="font-medium">{v.label}</span>
                        {v.paused ? <Badge>Paused</Badge> : null}
                        {step.leader === v.variantId ? <Badge variant="success">Ahead</Badge> : null}
                      </span>
                    </TableCell>
                    <TableCell className="tabular text-right">{v.leads.toLocaleString()}</TableCell>
                    <TableCell className="tabular text-right">
                      {v.openRate === null ? (
                        <span className="text-subtle-foreground">Not tracked</span>
                      ) : (
                        formatRate(v.openRate)
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">{formatRate(v.replyRate)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {step.tooEarly ? (
              <p className="px-5 text-xs text-muted-foreground">
                {`Too early to call: wait for ${MIN_SENDS_TO_CALL} leads on each version.`}
              </p>
            ) : null}
          </section>
        ))}
      </div>
    </Card>
  );
}
