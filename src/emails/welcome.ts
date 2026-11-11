// Welcome email — sent once when someone subscribes to the newsletter.
// This file IS the email. To tweak copy, links, logo or the sender line, edit the
// constants below; the layout is the template string in renderWelcomeEmail().
// Only the unsubscribe link is per-subscriber (passed in); everything else is static.
//
// Two versions, picked by GATE_ENABLED in src/config/features.ts:
//   gate on  -> pre-launch: short piece on what (K)NEED is, the teaser frame and
//               button. No links into the site, because every kneed.tv page resolves
//               to the holding page. Copy approved 2026-11-12 (project doc
//               claude/welcome-prelaunch-handoff.md). Name in capitals: (K)NEED.
//   gate off -> full site: explore the bakeries + submit a bakery. Copy pass still
//               due before 1 Dec; untouched here.
// Flipping the gate at launch switches the email automatically.
//
// DATE: the pre-launch caption (PRELAUNCH_CAPTION) carries the release date. When
// episode 01's date is locked, change it in the same pass as the holding page
// (see "Where the date lives" in claude/teaser-holding-page.md).

import { GATE_ENABLED } from '../config/features';

const SITE_URL = 'https://kneed.tv';
const LOGO_URL = 'https://res.cloudinary.com/dwffvgcj1/image/upload/v1786232421/K_NEED_LOGO_-_LIGHT_LG_lstkle.png';
const PREHEADER = 'Every new episode and bakery story, straight to your inbox.';
const INTRO = "Welcome to (K)Need, a cultural and culinary exploration of bread and pastry, told through the bakers who live it. You're on the list, so you'll be first to see every new episode.";
const PRIMARY_CTA_URL = 'https://kneed.tv/bakeries';
const PRIMARY_CTA_LABEL = 'Explore the bakeries';
const SECONDARY_CTA_URL = 'https://kneed.tv/submit';
const SECONDARY_CTA_LABEL = 'Submit a bakery';
const INSTAGRAM_URL = 'https://www.instagram.com/kneedtv';
const TIKTOK_URL = 'https://www.tiktok.com/@kneedtv';
const YOUTUBE_URL = 'https://www.youtube.com/@kneedtv';
const FACEBOOK_URL = 'https://www.facebook.com/kneedtv';
const SENDER_ADDRESS = 'Comma Films Pty Ltd, Australia';

// Pre-launch version (gate on). HTML strings use curly apostrophes (&rsquo;).
const PRELAUNCH_SUBJECT   = 'Welcome to (K)NEED';
const PRELAUNCH_PREHEADER = 'Bread, and the people who get up for it. The teaser&rsquo;s inside.';
const PRELAUNCH_EYEBROW   = 'Welcome to (K)NEED';
const PRELAUNCH_HEADING   = 'Bread, and the people who get up for it';
const PRELAUNCH_BLOCK_1   = 'While most of us are still asleep, the lights are already on in the bakery. The oven&rsquo;s hot, today&rsquo;s bake is in, and tomorrow&rsquo;s dough is already on the go.';
const PRELAUNCH_BLOCK_2   = 'Most of us only ever see the counter: the loaves on the shelf, the paper bag, the queue out the door. Step past it with us and into the kitchen.';
const PRELAUNCH_NAME      = '(K)NEED.'; // small label, never display size: the wordmark is never rebuilt in live text
const POSITIONING_LINE    = 'A cultural and culinary exploration of bread and pastry, told through the bakers who live it.'; // canonical, never reword
const PRELAUNCH_POSTER    = 'https://kneed.tv/images/kneed-teaser-poster-V2.jpeg'; // /images/ bypasses the gate
const PRELAUNCH_CTA_URL   = 'https://www.youtube.com/watch?v=8jPdhh_dZkI';
const PRELAUNCH_CAPTION   = 'Episode 01 &middot; December';
const PRELAUNCH_CTA_LABEL = 'Watch the teaser&nbsp;&middot;&nbsp;1:45'; // nbsp: never strand the runtime on its own line
const PRELAUNCH_SIGNOFF   = 'See you in the kitchen.';
const PRELAUNCH_FOOTER    = 'You&rsquo;re getting this because you signed up at kneed.tv.';

export const WELCOME_SUBJECT  = GATE_ENABLED ? PRELAUNCH_SUBJECT : 'Welcome to (K)Need';
export const WELCOME_FROM     = GATE_ENABLED ? '"(K)NEED" <hello@mail.kneed.tv>' : '"(K)Need" <hello@mail.kneed.tv>';
export const WELCOME_REPLY_TO = 'hello@kneed.tv';

// Shared styles. Small text and eyebrow colours pass WCAG AA on the cream card
// (Slate #57504a 6.8:1; eyebrow #8f5a1f 4.9:1); the old #8a8178 / #a89f94 / #a96c27
// were 3.3:1 / 2.2:1 / 3.7:1.
const F_LABEL = "'Archivo Narrow','Arial Narrow',Arial,sans-serif";
const F_HEAD  = "'Josefin Sans','Century Gothic',Futura,'Trebuchet MS',Arial,sans-serif";
const F_BODY  = "'Barlow',Helvetica,Arial,sans-serif";
const EYEBROW = '#8f5a1f';
const SLATE   = '#57504a';

function prelaunchContent(): string {
  const para = (t: string, extra = '') =>
    `<p style="font-family:${F_BODY};font-size:16px;line-height:1.7;color:#2b2724;margin:0 auto 18px;max-width:460px;${extra}">${t}</p>`;
  return `
    <tr>
    <td class="px" align="center" style="padding:44px 40px 18px;">
      <div style="font-family:${F_LABEL};font-weight:600;font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:${EYEBROW};">${PRELAUNCH_EYEBROW}</div>
      <h1 class="h1 h1-long" style="font-family:${F_HEAD};font-weight:300;font-size:30px;letter-spacing:0.08em;text-transform:uppercase;color:#0e0c0a;margin:14px 0 0;line-height:1.2;">${PRELAUNCH_HEADING}</h1>
    </td>
    </tr>

    <tr>
    <td class="px" align="center" style="padding:12px 40px 14px;">
      ${para(PRELAUNCH_BLOCK_1)}
      ${para(PRELAUNCH_BLOCK_2)}
      <div style="font-family:${F_LABEL};font-weight:600;font-size:14px;letter-spacing:0.22em;text-transform:uppercase;color:#0e0c0a;margin:6px 0 10px;">${PRELAUNCH_NAME}</div>
      ${para(POSITIONING_LINE, 'font-size:17px;margin-bottom:8px;')}
    </td>
    </tr>

    <tr>
    <td style="padding:18px 0 0;">
      <a href="${PRELAUNCH_CTA_URL}" style="text-decoration:none;display:block;">
        <img src="${PRELAUNCH_POSTER}" width="600" alt="Watch the (K)NEED teaser" style="display:block;width:100%;max-width:600px;height:auto;background:#0e0c0a;color:#f2ede6;font-family:${F_HEAD};font-size:18px;letter-spacing:0.1em;text-align:center;">
      </a>
    </td>
    </tr>

    <tr>
    <td class="px" align="center" style="padding:16px 40px 38px;">
      <div style="font-family:${F_LABEL};font-weight:600;font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:${EYEBROW};">${PRELAUNCH_CAPTION}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px auto 0;">
      <tr>
      <td align="center" bgcolor="#c8833a" style="background:#c8833a;border-radius:6px;">
        <a class="btn" href="${PRELAUNCH_CTA_URL}" style="display:inline-block;font-family:${F_LABEL};font-weight:600;font-size:13px;letter-spacing:0.14em;text-transform:uppercase;color:#0e0c0a;text-decoration:none;padding:15px 26px;border-radius:6px;">
          ${PRELAUNCH_CTA_LABEL}
        </a>
      </td>
      </tr>
      </table>
      <p style="font-family:${F_BODY};font-size:16px;line-height:1.7;color:#2b2724;margin:28px 0 0;">${PRELAUNCH_SIGNOFF}</p>
    </td>
    </tr>`;
}

function fullContent(): string {
  return `
    <tr>
    <td class="px" align="center" style="padding:44px 40px 20px;">
      <div style="font-family:${F_LABEL};font-weight:600;font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:${EYEBROW};">Welcome</div>
      <h1 class="h1" style="font-family:${F_HEAD};font-weight:300;font-size:34px;letter-spacing:0.1em;text-transform:uppercase;color:#0e0c0a;margin:14px 0 0;line-height:1.15;">You're in</h1>
    </td>
    </tr>

    <tr>
    <td class="px" align="center" style="padding:8px 40px 30px;">
      <p style="font-family:${F_BODY};font-size:16px;line-height:1.7;color:#2b2724;margin:0 auto;max-width:440px;">
        ${INTRO}
      </p>
    </td>
    </tr>

    <tr>
    <td class="px" style="padding:0 40px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #d8cfc2;border-bottom:1px solid #d8cfc2;">
        <tr>
        <td style="padding:16px 4px;border-bottom:1px solid #e4ddd2;">
          <div style="font-family:${F_LABEL};font-weight:600;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0e0c0a;">New episodes, first</div>
          <div style="font-family:${F_BODY};font-size:14px;color:${SLATE};line-height:1.55;margin-top:2px;">Every episode in your inbox the day it goes live.</div>
        </td>
        </tr>
        <tr>
        <td style="padding:16px 4px;">
          <div style="font-family:${F_LABEL};font-weight:600;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0e0c0a;">The story, not just the loaf</div>
          <div style="font-family:${F_BODY};font-size:14px;color:${SLATE};line-height:1.55;margin-top:2px;">Who the baker is, and why the bread tastes like that.</div>
        </td>
        </tr>
      </table>
    </td>
    </tr>

    <tr>
    <td class="px" align="center" style="padding:26px 40px 38px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
      <tr>
      <td align="center" bgcolor="#c8833a" style="background:#c8833a;border-radius:6px;">
        <a href="${PRIMARY_CTA_URL}" style="display:inline-block;font-family:${F_LABEL};font-weight:600;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#0e0c0a;text-decoration:none;padding:15px 34px;border-radius:6px;">
          ${PRIMARY_CTA_LABEL}
        </a>
      </td>
      </tr>
      </table>
      <div style="margin-top:20px;">
        <a href="${SECONDARY_CTA_URL}" style="font-family:${F_LABEL};font-weight:500;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:${EYEBROW};text-decoration:none;">${SECONDARY_CTA_LABEL} &rarr;</a>
      </div>
    </td>
    </tr>`;
}

export function renderWelcomeEmail(unsubscribeUrl: string): string {
  const pre = GATE_ENABLED;
  const preheader = pre ? PRELAUNCH_PREHEADER : PREHEADER;
  const title     = pre ? 'Welcome to (K)NEED' : '(K)NEED — Welcome';
  const footLine  = pre ? PRELAUNCH_FOOTER : "You're receiving this because you signed up at kneed.tv";

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${title}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400&family=Archivo+Narrow:wght@500;600&family=Barlow:wght@400;500&display=swap" rel="stylesheet">
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
  body{margin:0;padding:0;width:100%!important;background:#e4ddd2}
  a{color:${EYEBROW}}
  @media only screen and (max-width:600px){
    .container{width:100%!important}
    .px{padding-left:24px!important;padding-right:24px!important}
    .h1{font-size:30px!important}
    .h1-long{font-size:25px!important}
    .btn{padding:15px 18px!important;letter-spacing:0.1em!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e4ddd2;">

<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e4ddd2;opacity:0;">
  ${preheader}
</div>
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e4ddd2;">
<tr>
<td align="center" style="padding:28px 12px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#f2ede6;border-radius:10px;overflow:hidden;">

    <tr>
    <td align="center" bgcolor="#0e0c0a" style="background:#0e0c0a;padding:26px 20px;">
      <a href="${SITE_URL}" style="text-decoration:none;">
        <img src="${LOGO_URL}" width="200" alt="(K)NEED" style="display:block;width:200px;max-width:60%;height:auto;margin:0 auto;color:#f2ede6;font-family:${F_HEAD};font-weight:300;font-size:26px;letter-spacing:0.3em;text-align:center;">
      </a>
    </td>
    </tr>
${pre ? prelaunchContent() : fullContent()}

    <tr>
    <td class="px" align="center" bgcolor="#f2ede6" style="background:#f2ede6;padding:30px 40px;">
      <div style="font-family:${F_LABEL};font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:${SLATE};margin-bottom:14px;line-height:2;">
        <a href="${INSTAGRAM_URL}" style="color:${SLATE};text-decoration:none;white-space:nowrap;">Instagram</a> &nbsp;·&nbsp;
        <a href="${TIKTOK_URL}" style="color:${SLATE};text-decoration:none;white-space:nowrap;">TikTok</a> &nbsp;·&nbsp;
        <a href="${YOUTUBE_URL}" style="color:${SLATE};text-decoration:none;white-space:nowrap;">YouTube</a> &nbsp;·&nbsp;
        <a href="${FACEBOOK_URL}" style="color:${SLATE};text-decoration:none;white-space:nowrap;">Facebook</a>
      </div>
      <div style="font-family:${F_LABEL};font-size:11px;letter-spacing:0.24em;text-transform:uppercase;color:${SLATE};margin-bottom:12px;">A Comma Films Production</div>
      <div style="font-family:${F_BODY};font-size:13px;line-height:1.6;color:${SLATE};">
        ${footLine}<br>
        <a href="${unsubscribeUrl}" style="color:${SLATE};text-decoration:underline;">Unsubscribe</a><br>
        ${SENDER_ADDRESS}
      </div>
    </td>
    </tr>

  </table>

</td>
</tr>
</table>

</body>
</html>`;
}

// Plain-text part, sent alongside the HTML. Mirrors the copy above.
export function renderWelcomeText(unsubscribeUrl: string): string {
  if (GATE_ENABLED) {
    return [
      'Welcome to (K)NEED',
      '',
      'Bread, and the people who get up for it',
      '',
      'While most of us are still asleep, the lights are already on in the bakery. The oven’s hot, today’s bake is in, and tomorrow’s dough is already on the go.',
      '',
      'Most of us only ever see the counter: the loaves on the shelf, the paper bag, the queue out the door. Step past it with us and into the kitchen.',
      '',
      '(K)NEED.',
      '',
      POSITIONING_LINE,
      '',
      PRELAUNCH_CAPTION.replace('&middot;', '\u00b7'),
      `Watch the teaser (1:45): ${PRELAUNCH_CTA_URL}`,
      '',
      PRELAUNCH_SIGNOFF,
      '',
      'You’re getting this because you signed up at kneed.tv.',
      `Unsubscribe: ${unsubscribeUrl}`,
      SENDER_ADDRESS,
    ].join('\n');
  }
  return [
    "You're in",
    '',
    INTRO,
    '',
    `${PRIMARY_CTA_LABEL}: ${PRIMARY_CTA_URL}`,
    `${SECONDARY_CTA_LABEL}: ${SECONDARY_CTA_URL}`,
    '',
    "You're receiving this because you signed up at kneed.tv",
    `Unsubscribe: ${unsubscribeUrl}`,
    SENDER_ADDRESS,
  ].join('\n');
}
