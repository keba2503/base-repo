export type Box = { top: number; left: number; width: number; height: number };

export type TappableElement = { selector: string; box: Box };

export type FormField = { selector: string; fontSize: number };

export type LabelPair = { selector: string; labelBox: Box; fieldBox: Box };

export type PageSnapshot = {
  scrollWidth: number;
  clientWidth: number;
  tappables: readonly TappableElement[];
  formFields: readonly FormField[];
  labelPairs: readonly LabelPair[];
};

export type Viewport = { width: number; label: string };

export type Issue = {
  route: string;
  width: number;
  rule: string;
  selector?: string;
  message: string;
};

export const minimumTapSize = 44;

export const minimumFieldFontSize = 16;

function boxesOverlap(a: Box, b: Box): boolean {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;
}

export function viewportIssues(route: string, viewport: Viewport, snapshot: PageSnapshot): Issue[] {
  const issues: Issue[] = [];

  if (snapshot.scrollWidth > snapshot.clientWidth) {
    issues.push({
      route,
      width: viewport.width,
      rule: "horizontal-overflow",
      message: `the document scrolls horizontally: scrollWidth ${snapshot.scrollWidth}px > clientWidth ${snapshot.clientWidth}px`,
    });
  }

  for (const tappable of snapshot.tappables) {
    if (tappable.box.width < minimumTapSize || tappable.box.height < minimumTapSize) {
      issues.push({
        route,
        width: viewport.width,
        rule: "tap-target-too-small",
        selector: tappable.selector,
        message: `${tappable.selector} measures ${Math.round(tappable.box.width)}x${Math.round(tappable.box.height)}px, below the ${minimumTapSize}px minimum`,
      });
    }
  }

  for (const field of snapshot.formFields) {
    if (field.fontSize < minimumFieldFontSize) {
      issues.push({
        route,
        width: viewport.width,
        rule: "input-font-too-small",
        selector: field.selector,
        message: `${field.selector} uses ${field.fontSize}px text, below the ${minimumFieldFontSize}px minimum that keeps iOS from zooming in on focus`,
      });
    }
  }

  for (const pair of snapshot.labelPairs) {
    if (boxesOverlap(pair.labelBox, pair.fieldBox)) {
      issues.push({
        route,
        width: viewport.width,
        rule: "label-overlaps-field",
        selector: pair.selector,
        message: `the label for ${pair.selector} overlaps its own field`,
      });
    }
  }

  return issues;
}

export function formatIssues(issues: readonly Issue[]): string {
  return issues.map((issue) => `${issue.route} @ ${issue.width}px [${issue.rule}] ${issue.message}`).join("\n");
}

const appDirectory = "apps/web/src/app/";
const pageFileSuffix = "/page.tsx";
const rootPageFile = `${appDirectory}page.tsx`;

function isRouteSegment(segment: string): boolean {
  return !segment.startsWith("[") && !segment.startsWith("(");
}

export const documentDirectory = "docs/";

export function documentsFromFiles(files: readonly string[]): string[] {
  return files.filter((file) => file.startsWith(documentDirectory) && file.endsWith(".html")).sort();
}

export function routesFromPageFiles(files: readonly string[]): string[] {
  const routes = new Set<string>();

  for (const file of files) {
    if (file === rootPageFile) {
      routes.add("/");
      continue;
    }
    if (!file.startsWith(appDirectory) || !file.endsWith(pageFileSuffix)) continue;

    const segments = file.slice(appDirectory.length, -pageFileSuffix.length).split("/");
    if (!segments.every(isRouteSegment)) continue;

    routes.add(`/${segments.join("/")}`);
  }

  return [...routes].sort();
}
