// Custom campaign email — a general-purpose branded broadcast for non-episode
// communications. Reuses the exact same shell (header logo, 600px card, cream footer,
// no hairline divider) as episode-alert.ts; the content area is body-markdown driven
// instead of a single episode's thumbnail/title/CTA.
//
// The from address, reply-to, and social/footer chrome are shared with the episode
// broadcast — see episode-alert.ts as the source of truth for colours and fonts.

const LOGO_URL = 'https://res.cloudinary.com/dwffvgcj1/image/upload/v1786232421/K_NEED_LOGO_-_LIGHT_LG_lstkle.png';
const SENDER_ADDRESS = 'Comma Films Pty Ltd, Australia';

function esc(v: unknown): string {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Markdown subset → inline-styled email HTML ──────────────────────────────────
// A small, purpose-built renderer. A generic markdown library emits unstyled tags
// (<p>, <h2>, <a>…) that render inconsistently across email clients; here every tag
// carries the same inline type styles as episode-alert.ts. All text is HTML-escaped
// BEFORE any tag is wrapped around it, so raw HTML in the body can never break out.

const P_STYLE   = "font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#2b2724;margin:0 0 18px;";
const H2_STYLE  = "font-family:'Josefin Sans','Century Gothic',Futura,'Trebuchet MS',Arial,sans-serif;font-weight:300;font-size:22px;letter-spacing:0.08em;text-transform:uppercase;color:#0e0c0a;margin:26px 0 12px;line-height:1.2;";
const UL_STYLE  = "margin:0 0 18px;padding-left:22px;";
const LI_STYLE  = "font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.65;color:#2b2724;margin:0 0 6px;";
const A_STYLE   = "color:#a96c27;text-decoration:underline;";

// Whole-line button syntax: a block that is exactly `[Text](url)` and nothing else.
const BUTTON_RE = /^\[([^\]]+)\]\(([^)\s]+)\)$/;
// Inline link: [text](url)
const LINK_RE = /\[([^\]]+)\]\(([^)\s]+)\)/g;

// Escape then apply inline tokens: **bold**, *italic*, [text](url).
function inline(text: string): string {
  let s = esc(text);
  // Bold before italic so `**` isn't consumed as two single `*`.
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  // esc() already ran, so bracket/paren chars survive and the URL's `"`/`&` are entity-safe.
  s = s.replace(LINK_RE, (_m, label: string, url: string) => `<a href="${url}" style="${A_STYLE}">${label}</a>`);
  return s;
}

function ctaButton(text: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px auto;"><tr>
      <td align="center" bgcolor="#c8833a" style="background:#c8833a;border-radius:6px;">
        <a href="${esc(url)}" style="display:inline-block;font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-weight:600;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#0e0c0a;text-decoration:none;padding:15px 34px;border-radius:6px;">${esc(text)}</a>
      </td>
      </tr></table>`;
}

export function markdownToEmailHtml(md: string): string {
  const src = String(md ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  // Blocks are separated by one or more blank lines.
  const blocks = src.split(/\n\s*\n/).map(b => b.replace(/^\n+|\n+$/g, '')).filter(b => b.trim().length > 0);
  const out: string[] = [];

  for (const block of blocks) {
    const trimmed = block.trim();

    // 1. A block that is exactly a single [Text](url) → orange CTA button.
    const btn = trimmed.match(BUTTON_RE);
    if (btn && !trimmed.includes('\n')) {
      out.push(ctaButton(btn[1], btn[2]));
      continue;
    }

    const lines = block.split('\n');

    // 2. List block: every non-empty line begins with "- ".
    if (lines.every(l => /^\s*-\s+/.test(l))) {
      const items = lines.map(l => `<li style="${LI_STYLE}">${inline(l.replace(/^\s*-\s+/, ''))}</li>`).join('');
      out.push(`<ul style="${UL_STYLE}">${items}</ul>`);
      continue;
    }

    // 3. Heading: "## " on the first line (rendered as a single h2).
    if (/^##\s+/.test(trimmed)) {
      out.push(`<h2 style="${H2_STYLE}">${inline(trimmed.replace(/^##\s+/, ''))}</h2>`);
      continue;
    }

    // 4. Paragraph: internal single newlines become <br>.
    const html = lines.map(l => inline(l)).join('<br>');
    out.push(`<p style="${P_STYLE}">${html}</p>`);
  }

  return out.join('\n');
}

// ── Full branded email shell (identical to episode-alert.ts) ────────────────────
export interface CampaignEmailData {
  subject: string;
  preheader: string;
  bodyHtml: string;        // pre-rendered by markdownToEmailHtml — trusted, not re-escaped
  unsubscribeUrl: string;
}

export function renderCampaignEmail(d: CampaignEmailData): string {
  const subject   = esc(d.subject);
  const preheader = esc(d.preheader || d.subject);
  const unsub     = esc(d.unsubscribeUrl);
  const body      = d.bodyHtml || '';
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${subject}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
  body{margin:0;padding:0;width:100%!important;background:#e4ddd2}
  a{color:#a96c27}
  @media only screen and (max-width:600px){.container{width:100%!important}.px{padding-left:24px!important;padding-right:24px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:#e4ddd2;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e4ddd2;opacity:0;">${preheader}</div>
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e4ddd2;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#f2ede6;border-radius:10px;overflow:hidden;">
    <tr><td align="center" bgcolor="#0e0c0a" style="background:#0e0c0a;padding:26px 20px;">
      <a href="https://kneed.tv" style="text-decoration:none;"><img src="${LOGO_URL}" width="200" alt="(K)NEED" style="display:block;width:200px;max-width:60%;height:auto;margin:0 auto;"></a>
    </td></tr>
    <tr><td class="px" style="padding:38px 40px 34px;">
      ${body}
    </td></tr>
    <tr><td class="px" align="center" bgcolor="#f2ede6" style="background:#f2ede6;padding:30px 40px;">
      <div style="font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#57504a;margin-bottom:14px;">
        <a href="https://www.instagram.com/kneedtv" style="color:#57504a;text-decoration:none;">Instagram</a> &nbsp;·&nbsp;
        <a href="https://www.tiktok.com/@kneedtv" style="color:#57504a;text-decoration:none;">TikTok</a> &nbsp;·&nbsp;
        <a href="https://www.youtube.com/@kneedtv" style="color:#57504a;text-decoration:none;">YouTube</a> &nbsp;·&nbsp;
        <a href="https://www.facebook.com/kneedtv" style="color:#57504a;text-decoration:none;">Facebook</a>
      </div>
      <div style="font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#8a8178;">
        You're receiving this because you joined (K)Need at kneed.tv<br>
        <a href="${unsub}" style="color:#8a8178;text-decoration:underline;">Unsubscribe</a><br>
        <span style="color:#a89f94;">${SENDER_ADDRESS}</span>
      </div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
