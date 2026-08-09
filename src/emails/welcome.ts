// Welcome email — sent once when someone subscribes to the newsletter.
// This file IS the email. To tweak copy, links, logo or the sender line, edit the
// constants below; the layout is the template string in renderWelcomeEmail().
// Only the unsubscribe link is per-subscriber (passed in); everything else is static.

const SITE_URL = 'https://kneed.tv';
const LOGO_URL = 'https://res.cloudinary.com/dwffvgcj1/image/upload/v1786232421/K_NEED_LOGO_-_LIGHT_LG_lstkle.png';
const PREHEADER = 'Fresh bakery films and stories, straight to your inbox.';
const INTRO = "Welcome to (K)Need, a cultural and culinary exploration of breads and pastries told through the eyes of passionate bakers. You're on the list, so you'll be first to see every new film and story.";
const PRIMARY_CTA_URL = 'https://kneed.tv/bakeries';
const PRIMARY_CTA_LABEL = 'Explore the bakeries';
const SECONDARY_CTA_URL = 'https://kneed.tv/submit';
const SECONDARY_CTA_LABEL = 'Submit a bakery';
const INSTAGRAM_URL = 'https://www.instagram.com/kneedtv';
const TIKTOK_URL = 'https://www.tiktok.com/@kneedtv';
const YOUTUBE_URL = 'https://www.youtube.com/@kneedtv';
const FACEBOOK_URL = 'https://www.facebook.com/kneedtv';
const SENDER_ADDRESS = 'Comma Films Pty Ltd, Australia';

export const WELCOME_SUBJECT = 'Welcome to (K)Need';
export const WELCOME_FROM = 'hello@mail.kneed.tv';
export const WELCOME_REPLY_TO = 'hello@commafilms.com.au';

export function renderWelcomeEmail(unsubscribeUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>(K)NEED — Welcome</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Josefin+Sans:wght@300;400&family=Archivo+Narrow:wght@500;600&family=Barlow:wght@400;500&display=swap" rel="stylesheet">
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
  body{margin:0;padding:0;width:100%!important;background:#e4ddd2}
  a{color:#a96c27}
  @media only screen and (max-width:600px){
    .container{width:100%!important}
    .px{padding-left:24px!important;padding-right:24px!important}
    .h1{font-size:30px!important}
  }
</style>
</head>
<body style="margin:0;padding:0;background:#e4ddd2;">

<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e4ddd2;opacity:0;">
  ${PREHEADER}
</div>
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e4ddd2;">
<tr>
<td align="center" style="padding:28px 12px;">

  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#f2ede6;border-radius:10px;overflow:hidden;">

    <tr>
    <td align="center" bgcolor="#0e0c0a" style="background:#0e0c0a;padding:26px 20px;">
      <a href="${SITE_URL}" style="text-decoration:none;">
        <img src="${LOGO_URL}" width="200" alt="(K)NEED" style="display:block;width:200px;max-width:60%;height:auto;margin:0 auto;">
      </a>
    </td>
    </tr>

    <tr>
    <td class="px" align="center" style="padding:44px 40px 20px;">
      <div style="font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-weight:600;font-size:12px;letter-spacing:0.28em;text-transform:uppercase;color:#a96c27;">Welcome</div>
      <h1 class="h1" style="font-family:'Josefin Sans','Century Gothic',Futura,'Trebuchet MS',Arial,sans-serif;font-weight:300;font-size:34px;letter-spacing:0.1em;text-transform:uppercase;color:#0e0c0a;margin:14px 0 0;line-height:1.15;">You're in</h1>
    </td>
    </tr>

    <tr>
    <td class="px" align="center" style="padding:8px 40px 30px;">
      <p style="font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:#2b2724;margin:0 auto;max-width:440px;">
        ${INTRO}
      </p>
    </td>
    </tr>

    <tr>
    <td class="px" style="padding:0 40px 8px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #d8cfc2;border-bottom:1px solid #d8cfc2;">
        <tr>
        <td style="padding:16px 4px;border-bottom:1px solid #e4ddd2;">
          <div style="font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-weight:600;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0e0c0a;">New films, first</div>
          <div style="font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:14px;color:#57504a;line-height:1.55;margin-top:2px;">Every episode in your inbox the day it goes live.</div>
        </td>
        </tr>
        <tr>
        <td style="padding:16px 4px;">
          <div style="font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-weight:600;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#0e0c0a;">The story, not just the loaf</div>
          <div style="font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:14px;color:#57504a;line-height:1.55;margin-top:2px;">Who the baker is, and why the bread tastes like that.</div>
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
        <a href="${PRIMARY_CTA_URL}" style="display:inline-block;font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-weight:600;font-size:13px;letter-spacing:0.18em;text-transform:uppercase;color:#0e0c0a;text-decoration:none;padding:15px 34px;border-radius:6px;">
          ${PRIMARY_CTA_LABEL}
        </a>
      </td>
      </tr>
      </table>
      <div style="margin-top:20px;">
        <a href="${SECONDARY_CTA_URL}" style="font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-weight:500;font-size:13px;letter-spacing:0.1em;text-transform:uppercase;color:#a96c27;text-decoration:none;">${SECONDARY_CTA_LABEL} &rarr;</a>
      </div>
    </td>
    </tr>

    <tr><td style="padding:0 40px;"><div style="height:1px;line-height:1px;font-size:1px;background:#c4baae;">&nbsp;</div></td></tr>

    <tr>
    <td class="px" align="center" bgcolor="#e4ddd2" style="background:#e4ddd2;padding:30px 40px;">
      <div style="font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#57504a;margin-bottom:14px;">
        <a href="${INSTAGRAM_URL}" style="color:#57504a;text-decoration:none;">Instagram</a> &nbsp;·&nbsp;
        <a href="${TIKTOK_URL}" style="color:#57504a;text-decoration:none;">TikTok</a> &nbsp;·&nbsp;
        <a href="${YOUTUBE_URL}" style="color:#57504a;text-decoration:none;">YouTube</a> &nbsp;·&nbsp;
        <a href="${FACEBOOK_URL}" style="color:#57504a;text-decoration:none;">Facebook</a>
      </div>
      <div style="font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#8a8178;">
        You're receiving this because you signed up at kneed.tv<br>
        <a href="${unsubscribeUrl}" style="color:#8a8178;text-decoration:underline;">Unsubscribe</a><br>
        <span style="color:#a89f94;">${SENDER_ADDRESS}</span>
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
