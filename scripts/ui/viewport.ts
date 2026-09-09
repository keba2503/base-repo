/// <reference lib="dom" />
import { execSync, spawn } from "node:child_process";
import { chromium, type Page } from "playwright";
import {
  documentsFromFiles,
  formatIssues,
  routesFromPageFiles,
  viewportIssues,
  type Issue,
  type PageSnapshot,
  type Viewport,
} from "./check-viewport";

const projectRoot = `${import.meta.dir}/../..`;
const webRoot = `${projectRoot}/apps/web`;
const port = 4319;
const baseUrl = `http://localhost:${port}`;
const bootTimeoutMs = 60_000;
const pageHeight = 900;

const viewports: readonly Viewport[] = [
  { width: 375, label: "mobile" },
  { width: 768, label: "tablet" },
  { width: 1440, label: "laptop" },
  { width: 1920, label: "desktop" },
];

function trackedFiles(): string[] {
  return execSync("git ls-files --cached --others --exclude-standard", { encoding: "utf8" })
    .split("\n")
    .filter((file) => file.length > 0);
}

async function waitForServer(): Promise<void> {
  const deadline = Date.now() + bootTimeoutMs;
  while (Date.now() < deadline) {
    const reachable = await fetch(baseUrl).then(
      (response) => response.ok || response.status === 404,
      () => false,
    );
    if (reachable) return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`the web app never answered at ${baseUrl} within ${bootTimeoutMs}ms`);
}

function collectSnapshot(): PageSnapshot {
  function isVisible(element: Element): boolean {
    const style = window.getComputedStyle(element);
    if (style.display === "none" || style.visibility === "hidden") return false;
    const rect = element.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }

  function selectorFor(element: Element, index: number): string {
    const tag = element.tagName.toLowerCase();
    if (element.id.length > 0) return `${tag}#${element.id}`;
    const name = element.getAttribute("name");
    if (name !== null) return `${tag}[name=${name}]`;
    return `${tag}:nth-of-type(${index + 1})`;
  }

  const boxOf = (rect: DOMRect) => ({ top: rect.top, left: rect.left, width: rect.width, height: rect.height });

  const tappables = Array.from(document.querySelectorAll("button, a[href], input, select, textarea, [role=button]"))
    .filter(isVisible)
    .map((element, index) => ({ selector: selectorFor(element, index), box: boxOf(element.getBoundingClientRect()) }));

  const textualFieldTypes = new Set(["text", "email", "password", "search", "tel", "url", "number", "date"]);
  const formFields = Array.from(document.querySelectorAll("input, select, textarea"))
    .filter(isVisible)
    .filter((element) => {
      if (element.tagName !== "INPUT") return true;
      const type = (element.getAttribute("type") ?? "text").toLowerCase();
      return textualFieldTypes.has(type);
    })
    .map((element, index) => ({
      selector: selectorFor(element, index),
      fontSize: Number.parseFloat(window.getComputedStyle(element).fontSize),
    }));

  const labelPairs = Array.from(document.querySelectorAll("label[for]"))
    .filter(isVisible)
    .flatMap((label, index) => {
      const forId = label.getAttribute("for");
      const field = forId === null ? null : document.getElementById(forId);
      if (field === null || !isVisible(field) || label.contains(field)) return [];
      return [
        {
          selector: selectorFor(field, index),
          labelBox: boxOf(label.getBoundingClientRect()),
          fieldBox: boxOf(field.getBoundingClientRect()),
        },
      ];
    });

  return {
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    tappables,
    formFields,
    labelPairs,
  };
}

async function issuesForTarget(page: Page, label: string, url: string): Promise<Issue[]> {
  const issues: Issue[] = [];
  for (const viewport of viewports) {
    await page.setViewportSize({ width: viewport.width, height: pageHeight });
    await page.goto(url, { waitUntil: "networkidle" });
    const snapshot = await page.evaluate(collectSnapshot);
    issues.push(...viewportIssues(label, viewport, snapshot));
  }
  return issues;
}

async function main(): Promise<void> {
  const files = trackedFiles();
  const routes = routesFromPageFiles(files);
  const documents = documentsFromFiles(files);
  if (routes.length === 0) throw new Error("no route was found under apps/web/src/app");

  const server = spawn("bun", ["run", "dev", "--", "-p", String(port)], {
    cwd: webRoot,
    detached: true,
    stdio: "ignore",
    env: { PATH: process.env.PATH ?? "", HOME: process.env.HOME ?? "", NODE_ENV: "development" },
  });

  try {
    await waitForServer();

    const browser = await chromium.launch().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("Executable doesn't exist")) {
        throw new Error(`chromium is not installed for this Playwright version. Run: bun run browsers`);
      }
      throw error;
    });
    try {
      const page = await browser.newPage();
      const issues: Issue[] = [];
      for (const route of routes) issues.push(...(await issuesForTarget(page, route, `${baseUrl}${route}`)));
      if (documents.length > 0) {
        const documentPage = await browser.newPage({ javaScriptEnabled: false });
        for (const document of documents) {
          issues.push(...(await issuesForTarget(documentPage, document, `file://${projectRoot}/${document}`)));
        }
      }

      if (issues.length > 0) {
        console.error(formatIssues(issues));
        process.exitCode = 1;
        return;
      }
      console.log(
        `viewport check passed for ${routes.length} routes and ${documents.length} documents across ${viewports.length} widths`,
      );
    } finally {
      await browser.close();
    }
  } finally {
    if (server.pid !== undefined) {
      try {
        process.kill(-server.pid, "SIGTERM");
      } catch {
        server.kill("SIGTERM");
      }
    }
  }
}

await main();
