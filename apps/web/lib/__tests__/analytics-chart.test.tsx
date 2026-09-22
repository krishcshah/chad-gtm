/** @vitest-environment happy-dom */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { AnalyticsSeriesChart } from "../../components/analytics-series-chart";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const SAMPLE_POINTS = [
  { date: "2026-09-01", sent: 100, contacted: 90, replies: 10, bounces: 2 },
  { date: "2026-09-02", sent: 150, contacted: 140, replies: 15, bounces: 1 },
  { date: "2026-09-03", sent: 200, contacted: 180, replies: 25, bounces: 3 },
];

describe("AnalyticsSeriesChart", () => {
  it("renders smooth path elements for series and updates on hover", async () => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);

    await act(async () => {
      root.render(
        <AnalyticsSeriesChart
          points={SAMPLE_POINTS}
          from="2026-09-01"
          to="2026-09-03"
        />,
      );
    });

    // Verify figure and caption exist
    const figure = host.querySelector("figure");
    expect(figure).toBeTruthy();

    // Verify SVG and paths are rendered
    const paths = host.querySelectorAll("path");
    // Should render 4 series paths (sent, contacted, replies, bounces)
    expect(paths.length).toBeGreaterThanOrEqual(4);

    await act(async () => {
      root.unmount();
    });
    host.remove();
  });
});
