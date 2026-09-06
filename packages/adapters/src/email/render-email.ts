import type { EmailViewModel } from "./email-view-model";

export type RenderedEmail = {
  readonly html: string;
  readonly text: string;
};

export const emailTokens = {
  background: "#ffffff",
  foreground: "#171717",
  accent: "#2563eb",
  fontSans: "system-ui, -apple-system, 'Segoe UI', sans-serif",
} as const;

const replacementsByCharacter: Readonly<Record<string, string>> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => replacementsByCharacter[character] ?? character);
}

const bodyStyle = `margin:0;padding:0;background:${emailTokens.background};color:${emailTokens.foreground};font-family:${emailTokens.fontSans};`;
const frameStyle = "padding:56px 24px 72px;";
const columnStyle = "max-width:560px;";
const headlineStyle = "margin:0 0 32px;font-size:32px;line-height:1.15;font-weight:600;letter-spacing:-0.01em;";
const paragraphStyle = "margin:0 0 12px;font-size:17px;line-height:1.5;";
const actionRowStyle = "margin:40px 0 0;font-size:17px;line-height:1.5;";
const actionStyle = `color:${emailTokens.accent};font-weight:600;text-decoration:underline;text-underline-offset:0.2em;`;

function layout(viewModel: EmailViewModel, content: string): string {
  return [
    "<!DOCTYPE html>",
    `<html lang="${escapeHtml(viewModel.language)}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(viewModel.subject)}</title>`,
    "</head>",
    `<body style="${bodyStyle}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${emailTokens.background};">`,
    `<tr><td style="${frameStyle}">`,
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${columnStyle}">`,
    "<tr><td>",
    content,
    "</td></tr>",
    "</table>",
    "</td></tr>",
    "</table>",
    "</body>",
    "</html>",
  ].join("\n");
}

function htmlOf(viewModel: EmailViewModel): string {
  const paragraphs = viewModel.paragraphs
    .map((paragraph) => `<p style="${paragraphStyle}">${escapeHtml(paragraph)}</p>`)
    .join("\n");
  const content = [
    `<h1 style="${headlineStyle}">${escapeHtml(viewModel.headline)}</h1>`,
    paragraphs,
    `<p style="${actionRowStyle}"><a href="${escapeHtml(viewModel.actionUrl)}" style="${actionStyle}">${escapeHtml(viewModel.actionLabel)}</a></p>`,
  ].join("\n");
  return layout(viewModel, content);
}

function textOf(viewModel: EmailViewModel): string {
  return [viewModel.headline, ...viewModel.paragraphs, `${viewModel.actionLabel}: ${viewModel.actionUrl}`].join("\n\n");
}

export function renderEmail(viewModel: EmailViewModel): RenderedEmail {
  return { html: htmlOf(viewModel), text: textOf(viewModel) };
}
