// Submission-received email — sent to the person who submitted a bakery, if they left an
// email. Transactional confirmation, no marketing unsubscribe. Edit copy/links/logo here.

const LOGO_URL = 'https://res.cloudinary.com/dwffvgcj1/image/upload/v1786232421/K_NEED_LOGO_-_LIGHT_LG_lstkle.png';
const SENDER_ADDRESS = 'Comma Films Pty Ltd, Australia';

export const SUBMISSION_SUBJECT = 'Thanks for the tip';
export const SUBMISSION_FROM = 'hello@mail.kneed.tv';
export const SUBMISSION_REPLY_TO = 'hello@commafilms.com.au';

function esc(v: string): string {
  return String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function renderSubmissionEmail(bakeryName: string, bakerySuburb: string): string {
  const name = esc(bakeryName);
  const suburb = esc(bakerySuburb);
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>(K)NEED — Submission received</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<![endif]-->
<style>
  body,table,td,a{-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  table,td{mso-table-lspace:0pt;mso-table-rspace:0pt}
  img{-ms-interpolation-mode:bicubic;border:0;height:auto;line-height:100%;outline:none;text-decoration:none}
  body{margin:0;padding:0;width:100%!important;background:#e4ddd2}
  a{color:#a96c27}
  @media only screen and (max-width:600px){.container{width:100%!important}.px{padding-left:24px!important;padding-right:24px!important}.h1{font-size:28px!important}}
</style>
</head>
<body style="margin:0;padding:0;background:#e4ddd2;">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:#e4ddd2;opacity:0;">Thanks for the tip. We've got ${name} on the list.</div>
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;">&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;&nbsp;&zwnj;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e4ddd2;">
<tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" class="container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:#f2ede6;border-radius:10px;overflow:hidden;">
    <tr><td align="center" bgcolor="#0e0c0a" style="background:#0e0c0a;padding:26px 20px;">
      <a href="https://kneed.tv" style="text-decoration:none;"><img src="${LOGO_URL}" width="200" alt="(K)NEED" style="display:block;width:200px;max-width:60%;height:auto;margin:0 auto;"></a>
    </td></tr>
    <tr><td class="px" style="padding:44px 40px 20px;">
      <div style="font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-weight:600;font-size:12px;letter-spacing:0.26em;text-transform:uppercase;color:#a96c27;">Submission received</div>
      <h1 class="h1" style="font-family:'Josefin Sans','Century Gothic',Futura,'Trebuchet MS',Arial,sans-serif;font-weight:300;font-size:31px;letter-spacing:0.09em;text-transform:uppercase;color:#0e0c0a;margin:14px 0 16px;line-height:1.15;">Thanks for the tip</h1>
      <p style="font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:16px;line-height:1.7;color:#2b2724;margin:0 0 8px;">Every bakery on (K)Need starts with someone telling us about one. We've got yours:</p>
    </td></tr>
    <tr><td class="px" style="padding:0 40px 24px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#e4ddd2;border-radius:8px;"><tr><td style="padding:20px 24px;">
        <div style="font-family:'Josefin Sans','Century Gothic',Futura,'Trebuchet MS',Arial,sans-serif;font-weight:400;font-size:19px;letter-spacing:0.04em;color:#0e0c0a;">${name}</div>${suburb ? `
        <div style="font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-size:13px;letter-spacing:0.12em;text-transform:uppercase;color:#57504a;margin-top:4px;">${suburb}</div>` : ''}
      </td></tr></table>
    </td></tr>
    <tr><td class="px" style="padding:0 40px 34px;">
      <p style="font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:15px;line-height:1.7;color:#57504a;margin:0;">We read every submission. We can't film them all, but the good ones go on the list, and if we head there, we'll be in touch. No need to reply.</p>
    </td></tr>
    <tr><td style="padding:0 40px;"><div style="height:1px;line-height:1px;font-size:1px;background:#c4baae;">&nbsp;</div></td></tr>
    <tr><td class="px" align="center" bgcolor="#e4ddd2" style="background:#e4ddd2;padding:30px 40px;">
      <div style="font-family:'Archivo Narrow','Arial Narrow',Arial,sans-serif;font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#57504a;margin-bottom:14px;">
        <a href="https://www.instagram.com/kneedtv" style="color:#57504a;text-decoration:none;">Instagram</a> &nbsp;·&nbsp;
        <a href="https://www.tiktok.com/@kneedtv" style="color:#57504a;text-decoration:none;">TikTok</a> &nbsp;·&nbsp;
        <a href="https://www.youtube.com/@kneedtv" style="color:#57504a;text-decoration:none;">YouTube</a> &nbsp;·&nbsp;
        <a href="https://www.facebook.com/kneedtv" style="color:#57504a;text-decoration:none;">Facebook</a>
      </div>
      <div style="font-family:'Barlow',Helvetica,Arial,sans-serif;font-size:12.5px;line-height:1.6;color:#8a8178;">This is a one-off confirmation of your bakery submission at kneed.tv<br><span style="color:#a89f94;">${SENDER_ADDRESS}</span></div>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}
