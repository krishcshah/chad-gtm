import { redirect } from "next/navigation";

/** Bug reports are support tickets now: open Support with a new bug ticket ready to fill in. */
export default function BugReportRedirectPage() {
  redirect("/support?new=bug_report");
}
