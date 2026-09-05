import { describe, expect, it } from "bun:test";
import { emailTokens, escapeHtml, renderEmail } from "../src/index";
import { emailViewModelFactory } from "./factories/email-view-model";

describe("escape html", () => {
  it("escapes the five characters that break markup", () => {
    expect(escapeHtml(`Tom & Jerry <b>"quoted" 'single'</b>`)).toBe(
      "Tom &amp; Jerry &lt;b&gt;&quot;quoted&quot; &#39;single&#39;&lt;/b&gt;",
    );
  });

  it("leaves plain text untouched", () => {
    expect(escapeHtml("Acme Clinic")).toBe("Acme Clinic");
  });
});

describe("render email html", () => {
  it("places the headline in the heading", () => {
    expect(renderEmail(emailViewModelFactory()).html).toContain("Acme Clinic is ready.</h1>");
  });

  it("renders every paragraph", () => {
    const { html } = renderEmail(emailViewModelFactory({ paragraphs: ["First.", "Second."] }));
    expect(html).toContain(">First.</p>");
    expect(html).toContain(">Second.</p>");
  });

  it("links the action label to the action url", () => {
    expect(renderEmail(emailViewModelFactory()).html).toContain(
      'href="https://app.example.com/tenants/acme-clinic"',
    );
  });

  it("uses the subject as the document title", () => {
    expect(renderEmail(emailViewModelFactory()).html).toContain("<title>Acme Clinic is created</title>");
  });

  it("declares the language of the view model", () => {
    expect(renderEmail(emailViewModelFactory({ language: "es" })).html).toContain('<html lang="es">');
  });

  it("escapes markup smuggled into the headline", () => {
    const { html } = renderEmail(emailViewModelFactory({ headline: "<script>alert(1)</script>" }));
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });

  it("escapes quotes smuggled into the action url", () => {
    const { html } = renderEmail(emailViewModelFactory({ actionUrl: 'https://x.example/" onclick="steal()' }));
    expect(html).not.toContain('" onclick="');
    expect(html).toContain("&quot; onclick=&quot;steal()");
  });

  it("escapes an ampersand in the tenant name", () => {
    expect(renderEmail(emailViewModelFactory({ headline: "Smith & Sons is ready." })).html).toContain(
      "Smith &amp; Sons is ready.",
    );
  });

  it("styles the action with the accent token inline", () => {
    expect(renderEmail(emailViewModelFactory()).html).toContain(`color:${emailTokens.accent}`);
  });

  it("paints the body with the background and foreground tokens inline", () => {
    const { html } = renderEmail(emailViewModelFactory());
    expect(html).toContain(`background:${emailTokens.background}`);
    expect(html).toContain(`color:${emailTokens.foreground}`);
  });

  it("uses no stylesheet", () => {
    expect(renderEmail(emailViewModelFactory()).html).not.toContain("<style");
  });
});

describe("render email text", () => {
  it("starts with the headline", () => {
    expect(renderEmail(emailViewModelFactory()).text.startsWith("Acme Clinic is ready.")).toBe(true);
  });

  it("separates the paragraphs with blank lines", () => {
    const { text } = renderEmail(emailViewModelFactory({ paragraphs: ["First.", "Second."] }));
    expect(text).toContain("First.\n\nSecond.");
  });

  it("ends with the action label and url", () => {
    expect(renderEmail(emailViewModelFactory()).text.endsWith(
      "Open Acme Clinic: https://app.example.com/tenants/acme-clinic",
    )).toBe(true);
  });

  it("contains no markup", () => {
    expect(renderEmail(emailViewModelFactory()).text).not.toMatch(/<[a-z!/]/i);
  });

  it("does not escape the text part", () => {
    expect(renderEmail(emailViewModelFactory({ headline: "Smith & Sons is ready." })).text).toContain(
      "Smith & Sons is ready.",
    );
  });
});
