import { describe, expect, test } from "bun:test";
import { documentsFromFiles, routesFromPageFiles, viewportIssues, type PageSnapshot, type Viewport } from "./check-viewport";

const viewport: Viewport = { width: 375, label: "mobile" };

function emptySnapshot(overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    scrollWidth: 375,
    clientWidth: 375,
    tappables: [],
    formFields: [],
    labelPairs: [],
    ...overrides,
  };
}

describe("viewportIssues", () => {
  test("passes a snapshot with no problems", () => {
    expect(viewportIssues("/", viewport, emptySnapshot())).toEqual([]);
  });

  test("flags horizontal overflow", () => {
    const issues = viewportIssues("/", viewport, emptySnapshot({ scrollWidth: 480, clientWidth: 375 }));
    expect(issues).toEqual([
      {
        route: "/",
        width: 375,
        rule: "horizontal-overflow",
        message: "the document scrolls horizontally: scrollWidth 480px > clientWidth 375px",
      },
    ]);
  });

  test("flags a tap target smaller than 44px in either dimension", () => {
    const issues = viewportIssues(
      "/tenants/new",
      viewport,
      emptySnapshot({ tappables: [{ selector: "button[type=submit]", box: { top: 0, left: 0, width: 40, height: 44 } }] }),
    );
    expect(issues.some((issue) => issue.rule === "tap-target-too-small")).toBe(true);
  });

  test("allows a tap target at exactly 44px", () => {
    const issues = viewportIssues(
      "/tenants/new",
      viewport,
      emptySnapshot({ tappables: [{ selector: "button[type=submit]", box: { top: 0, left: 0, width: 44, height: 44 } }] }),
    );
    expect(issues).toEqual([]);
  });

  test("flags a form field with text under 16px", () => {
    const issues = viewportIssues(
      "/tenants/new",
      viewport,
      emptySnapshot({ formFields: [{ selector: "input#name", fontSize: 14 }] }),
    );
    expect(issues).toEqual([
      {
        route: "/tenants/new",
        width: 375,
        rule: "input-font-too-small",
        selector: "input#name",
        message: "input#name uses 14px text, below the 16px minimum that keeps iOS from zooming in on focus",
      },
    ]);
  });

  test("allows a form field at exactly 16px", () => {
    const issues = viewportIssues(
      "/tenants/new",
      viewport,
      emptySnapshot({ formFields: [{ selector: "input#name", fontSize: 16 }] }),
    );
    expect(issues).toEqual([]);
  });

  test("flags a label that overlaps its field", () => {
    const issues = viewportIssues(
      "/tenants/new",
      viewport,
      emptySnapshot({
        labelPairs: [
          {
            selector: "label[for=name]",
            labelBox: { top: 0, left: 0, width: 100, height: 20 },
            fieldBox: { top: 5, left: 50, width: 100, height: 20 },
          },
        ],
      }),
    );
    expect(issues.some((issue) => issue.rule === "label-overlaps-field")).toBe(true);
  });

  test("allows a label next to its field with no overlap", () => {
    const issues = viewportIssues(
      "/tenants/new",
      viewport,
      emptySnapshot({
        labelPairs: [
          {
            selector: "label[for=name]",
            labelBox: { top: 0, left: 0, width: 100, height: 20 },
            fieldBox: { top: 24, left: 0, width: 100, height: 20 },
          },
        ],
      }),
    );
    expect(issues).toEqual([]);
  });

  test("reports every kind of issue found in the same snapshot", () => {
    const issues = viewportIssues(
      "/tenants/new",
      viewport,
      emptySnapshot({
        scrollWidth: 500,
        clientWidth: 375,
        tappables: [{ selector: "button[type=submit]", box: { top: 0, left: 0, width: 30, height: 30 } }],
        formFields: [{ selector: "input#name", fontSize: 12 }],
      }),
    );
    expect(issues.map((issue) => issue.rule)).toEqual([
      "horizontal-overflow",
      "tap-target-too-small",
      "input-font-too-small",
    ]);
  });
});

describe("routesFromPageFiles", () => {
  test("maps the root page to /", () => {
    expect(routesFromPageFiles(["apps/web/src/app/page.tsx"])).toEqual(["/"]);
  });

  test("maps a nested page to its path", () => {
    expect(routesFromPageFiles(["apps/web/src/app/tenants/new/page.tsx"])).toEqual(["/tenants/new"]);
  });

  test("skips a dynamic segment", () => {
    expect(routesFromPageFiles(["apps/web/src/app/tenants/[slug]/page.tsx"])).toEqual([]);
  });

  test("skips a route group", () => {
    expect(routesFromPageFiles(["apps/web/src/app/(marketing)/about/page.tsx"])).toEqual([]);
  });

  test("ignores files that are not page.tsx", () => {
    expect(routesFromPageFiles(["apps/web/src/app/tenants/new/actions.ts"])).toEqual([]);
  });

  test("ignores files outside apps/web/src/app", () => {
    expect(routesFromPageFiles(["apps/web/src/main/env.ts"])).toEqual([]);
  });

  test("sorts and deduplicates the result", () => {
    expect(
      routesFromPageFiles([
        "apps/web/src/app/tenants/new/page.tsx",
        "apps/web/src/app/page.tsx",
        "apps/web/src/app/page.tsx",
      ]),
    ).toEqual(["/", "/tenants/new"]);
  });
});

describe("documentsFromFiles", () => {
  test("collects the html documents under docs, sorted", () => {
    expect(documentsFromFiles(["docs/b.html", "docs/a.html"])).toEqual(["docs/a.html", "docs/b.html"]);
  });

  test("ignores documents that are not html and html outside docs", () => {
    expect(documentsFromFiles(["docs/base.md", "README.html", "apps/web/x.html"])).toEqual([]);
  });

  test("returns nothing when a derived project ships no html document, instead of failing", () => {
    expect(documentsFromFiles(["docs/architecture/layers.md", "apps/web/src/app/page.tsx"])).toEqual([]);
  });
});
