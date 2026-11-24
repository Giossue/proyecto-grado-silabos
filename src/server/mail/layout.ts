import { inlineCss } from "./inliner"
import { markdownToHtml } from "./markdown"
import { MAIL_THEME_CSS } from "./theme"

export type MailApp = { name: string; frontendUrl: string; locale: string }

export type MarkdownMailBody = { html: string; text: string }

export function e(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;")
}

export function htmlButton(url: string, label: string, color = "primary", align = "center"): string {
  return `<table class="action" align="${e(align)}" width="100%" cellpadding="0" cellspacing="0" role="presentation">
<tr>
<td align="${e(align)}">
<table width="100%" border="0" cellpadding="0" cellspacing="0" role="presentation">
<tr>
<td align="${e(align)}">
<table border="0" cellpadding="0" cellspacing="0" role="presentation">
<tr>
<td>
<a href="${e(url)}" class="button button-${e(color)}" target="_blank" rel="noopener">${label}</a>
</td>
</tr>
</table>
</td>
</tr>
</table>
</td>
</tr>
</table>
`
}

export function textButton(url: string, label: string): string {
  return `${label}: ${url}\n`
}

function htmlLayout(app: MailApp, body: string): string {
  return `<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="${e(app.locale.replace(/_/g, "-"))}">
<head>
<title>${e(app.name)}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<style>
@media only screen and (max-width: 600px) {
.inner-body {
width: 100% !important;
}

.footer {
width: 100% !important;
}
}

@media only screen and (max-width: 500px) {
.button {
width: 100% !important;
}
}
</style>

</head>
<body>

<table class="wrapper" width="100%" cellpadding="0" cellspacing="0" role="presentation">
<tr>
<td align="center">
<table class="content" width="100%" cellpadding="0" cellspacing="0" role="presentation">
<tr>
<td class="header">
<a href="${e(app.frontendUrl)}" style="display: inline-block;">
${e(app.name)}
</a>
</td>
</tr>

<tr>
<td class="body" width="100%" cellpadding="0" cellspacing="0" style="border: hidden !important;">
<table class="inner-body" align="center" width="570" cellpadding="0" cellspacing="0" role="presentation">
<tr>
<td class="content-cell">
${markdownToHtml(body)}


</td>
</tr>
</table>
</td>
</tr>


</table>
</td>
</tr>
</table>
</body>
</html>
`
}

const PHP_TRIM = /^[ \t\n\r\0\x0B]+|[ \t\n\r\0\x0B]+$/g

export function bladeSlot(content: string): string {
  return content.replace(PHP_TRIM, "")
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, "")
}

const ESCAPED: Record<string, string> = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#039;": "'" }

function decodeEscaped(value: string): string {
  return value.replace(/&amp;|&lt;|&gt;|&quot;|&#039;/g, (entity) => ESCAPED[entity])
}

export function renderMarkdownMail(app: MailApp, body: MarkdownMailBody): { html: string; text: string } {
  const html = inlineCss(htmlLayout(app, bladeSlot(body.html)).replace(/\\\[/g, "["), MAIL_THEME_CSS)
  const header = bladeSlot(textButton(e(app.frontendUrl), e(app.name)))
  const text = decodeEscaped(`${stripTags(header)}\n\n${stripTags(bladeSlot(body.text))}\n\n\n`.replace(/[\r\n]{2,}/g, "\n\n"))
  return { html, text }
}
