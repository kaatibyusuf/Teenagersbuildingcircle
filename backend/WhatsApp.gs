/**
 * WhatsApp assistant (api/whatsapp on the website)
 *
 * The website receives each WhatsApp message from Meta, asks Claude for an answer, and uses this file to
 *   - log every message on the "WhatsApp chats" tab (so the bot remembers the last few turns),
 *   - skip messages Meta sends twice,
 *   - save enrolment enquiries on the "WhatsApp enquiries" tab and email the school,
 *   - email the school when a person needs a human (handover).
 * Both tabs are created automatically.
 *
 * SETUP (once)
 *   1. Add this as a new script file named WhatsApp (Code.gs already routes to it).
 *   2. The same CARD_SECRET you already set for card payments is used here. Nothing new to add.
 *   3. Deploy → Manage deployments → edit (pencil) → Version: New version → Deploy.
 */
const WA_CHAT_TAB = 'WhatsApp chats', WA_CHAT_HEAD = ['Time', 'Phone', 'Name', 'From', 'Text', 'MsgID'];
const WA_LEAD_TAB = 'WhatsApp enquiries', WA_LEAD_HEAD = ['Time', 'Phone', 'Name', 'Programme', 'Detail', 'Status'];
const WA_HISTORY = 8;          // how many recent messages the bot sees
const WA_STAFF = [];           // extra emails to alert; the script owner is always alerted

function wa_tab_(name, head) {
  const ss = ss_(); let sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold'); sh.setFrozenRows(1); sh.getRange(1, 2, 1000, 1).setNumberFormat('@'); }
  return sh;
}
function wa_clean_(v, n) { return String(v == null ? '' : v).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n); }
function wa_mail_(subject, body) {
  try {
    const to = [Session.getEffectiveUser().getEmail()].concat(WA_STAFF).filter(String).join(',');
    if (to && MailApp.getRemainingDailyQuota() > 2) MailApp.sendEmail({ to: to, name: 'Himaayah Schools', subject: subject, body: body });
  } catch (e) {}
}
function wa_row_(sh, row) { sh.getRange(sh.getLastRow() + 1, 1, 1, row.length).setNumberFormat('@').setValues([row]); }

function waChatFromRequest(p) {
  const secret = PropertiesService.getScriptProperties().getProperty('CARD_SECRET');
  if (!secret || !same_(String(p.secret || ''), secret)) return { ok: false, error: 'Not allowed' };
  const web = p.op === 'weblead' || p.op === 'webhandover';                  // from the website chat box: no phone number
  if (web) {
    const lock0 = LockService.getScriptLock(); lock0.waitLock(20000);
    try {
      const st = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
      if (p.op === 'weblead') {
        wa_row_(wa_tab_(WA_LEAD_TAB, WA_LEAD_HEAD), [st, wa_clean_(p.contact, 80), wa_clean_(p.name, 80), wa_clean_(p.programme, 60), wa_clean_(p.detail, 500) + ' (website chat)', 'New']);
        wa_mail_('Website chat enquiry: ' + wa_clean_(p.name, 60) + ' (' + wa_clean_(p.programme, 40) + ')', 'New enquiry from the website chat\n\nName: ' + wa_clean_(p.name, 80) + '\nProgramme: ' + wa_clean_(p.programme, 60) + '\nContact: ' + wa_clean_(p.contact, 80) + '\nDetail: ' + wa_clean_(p.detail, 500) + '\n\nIt is also on the "' + WA_LEAD_TAB + '" tab.');
      } else wa_mail_('Website chat: ' + wa_clean_(p.line, 30) + ' needed', 'A visitor to the website chat was sent to the ' + wa_clean_(p.line, 30) + '.\nReason: ' + wa_clean_(p.reason, 400));
      return { ok: true };
    } finally { lock0.releaseLock(); }
  }
  const phone = wa_clean_(p.phone, 20).replace(/\D/g, ''), now = new Date();
  if (!phone) return { ok: false, error: 'No phone' };
  const stamp = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const chat = wa_tab_(WA_CHAT_TAB, WA_CHAT_HEAD), last = chat.getLastRow();
    if (p.op === 'start') {
      const from = Math.max(2, last - 399), n = last >= 2 ? last - from + 1 : 0;
      const rows = n ? chat.getRange(from, 1, n, 6).getValues() : [];
      const id = wa_clean_(p.msgId, 120);
      if (id && rows.some(r => String(r[5]) === id)) return { ok: true, dup: true };
      const history = rows.filter(r => String(r[1]) === phone).slice(-WA_HISTORY).map(r => ({ role: r[3] === 'bot' ? 'assistant' : 'user', text: String(r[4]) }));
      wa_row_(chat, [stamp, phone, wa_clean_(p.name, 80), 'user', wa_clean_(p.text, 2000), id]);
      return { ok: true, history: history };
    }
    if (p.op === 'reply') { wa_row_(chat, [stamp, phone, '', 'bot', wa_clean_(p.text, 3800), '']); return { ok: true }; }
    if (p.op === 'lead') {
      const lead = wa_tab_(WA_LEAD_TAB, WA_LEAD_HEAD);
      wa_row_(lead, [stamp, phone, wa_clean_(p.name, 80), wa_clean_(p.programme, 60), wa_clean_(p.detail, 500), 'New']);
      wa_mail_('WhatsApp enquiry: ' + wa_clean_(p.name, 60) + ' (' + wa_clean_(p.programme, 40) + ')', 'New WhatsApp enquiry\n\nName: ' + wa_clean_(p.name, 80) + '\nProgramme: ' + wa_clean_(p.programme, 60) + '\nDetail: ' + wa_clean_(p.detail, 500) + '\nWhatsApp: https://wa.me/' + phone + '\n\nIt is also on the "' + WA_LEAD_TAB + '" tab.');
      return { ok: true };
    }
    if (p.op === 'handover') {
      wa_mail_('WhatsApp: ' + wa_clean_(p.line, 30) + ' needed for ' + (wa_clean_(p.name, 60) || phone), 'A person needs a human on WhatsApp.\n\nLine: ' + wa_clean_(p.line, 30) + '\nReason: ' + wa_clean_(p.reason, 400) + '\nWhatsApp: https://wa.me/' + phone + '\nName: ' + wa_clean_(p.name, 80));
      return { ok: true };
    }
    return { ok: false, error: 'Unknown op' };
  } finally { lock.releaseLock(); }
}
