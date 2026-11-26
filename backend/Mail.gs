/* ===== ALL OUTGOING EMAIL GOES THROUGH mail_() =====
   Mails are sent from the school's general address. For this to work, hello@himaayahschools.com must be a
   "Send mail as" address of the Google account that runs this script (easiest: make it an alias of that user in
   Google Admin). If it is not, the mail still goes out, just from the account's own address, with replies set to hello@. */
const MAIL_FROM = 'hello@himaayahschools.com';

function mail_(a, subject, body) {
  const o = (a && typeof a === 'object') ? Object.assign({}, a) : { to: a, subject: subject, body: body };
  if (!o.name) o.name = SCHOOL_NAME;
  if (!o.replyTo) o.replyTo = MAIL_FROM;
  try {
    const opt = { name: o.name, replyTo: o.replyTo, from: MAIL_FROM };
    ['htmlBody', 'cc', 'bcc', 'attachments', 'inlineImages'].forEach(function (k) { if (o[k]) opt[k] = o[k]; });
    GmailApp.sendEmail(o.to, o.subject, o.body || '', opt);
    return;
  } catch (e) {
    console.error('mail_ from ' + MAIL_FROM + ' failed, using default sender: ' + e);
  }
  MailApp.sendEmail(o);
}
