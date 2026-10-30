/**
 * Himaayah Store: paid books (₦5,000 each), with receipts.
 *
 * A buyer pays on Bachs (buy-guide page → api/guide-checkout). Bachs tells the website (api/bachs-webhook), which
 * passes the payment to cardPaymentFromRequest in CardPayments.gs, which calls guideCardPayment_ below. This
 * checks the payment, logs it in the "Card payments" tab, and emails the buyer a signed download link for each
 * book. The link is handled by api/guide-download on the website, which checks the signature before sending the PDF.
 *
 * Needs the same CARD_SECRET script property that the other card payments use (it must equal APPS_SCRIPT_SECRET on Vercel).
 *
 * The catalogue is GuidesCatalogue.gs (generated with the website's api/_guides.mjs by tools/store_build.py). Add both files to Apps Script.
 */
const GD_SITE = 'https://www.himaayahschools.com';
const GD_WA = '2347047226487';
// The catalogue (slug, short id, title, price) is in GuidesCatalogue.gs, generated from the website's guide list.
function gd_slug_(x) {                       // payment metadata holds short ids; accept a slug too
  x = String(x || '').trim();
  if (GD_CAT[x]) return x;
  for (const s in GD_CAT) if (GD_CAT[s].id === x) return s;
  return '';
}

function gd_token_(slug, ref) {
  const secret = PropertiesService.getScriptProperties().getProperty('CARD_SECRET') || '';
  const sig = Utilities.computeHmacSha256Signature('guide|' + slug + '|' + ref, secret);
  return sig.map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('').slice(0, 40);
}
function gd_link_(slug, ref) {
  return GD_SITE + '/api/guide-download?g=' + encodeURIComponent(slug) + '&r=' + encodeURIComponent(ref) + '&t=' + gd_token_(slug, ref);
}
function gd_esc_(t) { return String(t == null ? '' : t).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

function gd_b64url_(str) { return Utilities.base64EncodeWebSafe(Utilities.newBlob(str).getBytes()).replace(/=+$/, ''); }
// A signed link to the printable receipt (receipt.html on the website checks the signature)
function gd_receiptLink_(ref, name, email, slugs, amount) {
  const secret = PropertiesService.getScriptProperties().getProperty('CARD_SECRET') || '';
  const d = gd_b64url_(JSON.stringify({ r: ref, n: name, e: email, t: new Date().getTime(), i: slugs.map(function (s) { return GD_CAT[s].id; }), a: amount }));
  const sig = Utilities.computeHmacSha256Signature('receipt|' + d, secret);
  const hex = sig.map(function (b) { return ('0' + (b < 0 ? b + 256 : b).toString(16)).slice(-2); }).join('').slice(0, 40);
  return GD_SITE + '/receipt?d=' + d + '&t=' + hex;
}

// One email that is both the receipt and the download links
function gd_sendBooks_(name, email, ref, slugs, amount) {
  const first = String(name || '').split(' ')[0] || 'there';
  const list = slugs.map(function (s) { return { title: GD_CAT[s].t, price: GD_CAT[s].p, url: gd_link_(s, ref) }; });
  const receipt = gd_receiptLink_(ref, name, email, slugs, amount);
  const when = Utilities.formatDate(new Date(), tz_(), 'd MMM yyyy, h:mm a');
  const wa = 'https://wa.me/' + GD_WA + '?text=' + encodeURIComponent('Assalaamu alaykum. I bought from the Himaayah Store (' + ref + ') and need help.');
  const text = 'Assalaamu alaykum ' + first + ',\n\nThank you. Your payment is confirmed.\n\nRECEIPT ' + ref + '  (' + when + ')\n' +
    list.map(function (b) { return ' - ' + b.title + '   ' + naira_(b.price); }).join('\n') + '\nTotal paid: ' + naira_(amount) + '\n\nDOWNLOADS\n' +
    list.map(function (b) { return b.title + '\n' + b.url; }).join('\n\n') +
    '\n\nPrintable receipt: ' + receipt + '\n\nTip: print on A4 paper or open on a tablet. Keep this email, because the links work again whenever you need them.\nAny problem? WhatsApp us: ' + wa + '\n\n' + SCHOOL_NAME;
  const rows = list.map(function (b) { return '<tr><td style="padding:10px 0;border-bottom:1px solid #e3ebf2">' + gd_esc_(b.title) + '</td><td style="padding:10px 0;border-bottom:1px solid #e3ebf2;text-align:right;white-space:nowrap">' + gd_esc_(naira_(b.price)) + '</td></tr>'; }).join('');
  const buttons = list.map(function (b) { return '<p style="margin:10px 0"><a href="' + b.url + '" style="display:inline-block;background:#094570;color:#fff;text-decoration:none;font-weight:bold;padding:12px 18px;border-radius:10px">Download: ' + gd_esc_(b.title) + '</a></p>'; }).join('');
  const html = '<div style="font-family:Arial,sans-serif;max-width:560px;color:#0b2a3f;line-height:1.55">' +
    '<table width="100%" style="border-bottom:3px solid #094570;padding-bottom:10px"><tr><td><img src="' + GD_SITE + '/logo.png" width="52" height="52" alt="Himaayah Schools" style="vertical-align:middle;border-radius:8px"> <b style="font-size:18px;vertical-align:middle;margin-left:8px">Himaayah Store</b></td><td style="text-align:right;color:#5b6b78;font-size:13px">RECEIPT<br><b style="color:#0b2a3f">' + gd_esc_(ref) + '</b></td></tr></table>' +
    '<p>Assalaamu alaykum ' + gd_esc_(first) + ',</p><p>Thank you. Your payment is confirmed. Here is your receipt and your download' + (list.length > 1 ? 's' : '') + '.</p>' +
    '<table width="100%" style="border-collapse:collapse;font-size:15px"><tr style="color:#5b6b78;font-size:12px;text-transform:uppercase"><td style="padding-bottom:6px">Item</td><td style="text-align:right;padding-bottom:6px">Price</td></tr>' + rows +
    '<tr><td style="padding:12px 0;font-weight:bold">Total paid</td><td style="padding:12px 0;text-align:right;font-weight:bold">' + gd_esc_(naira_(amount)) + '</td></tr></table>' +
    '<p style="color:#5b6b78;font-size:13px">' + gd_esc_(when) + ' &middot; Paid online through Bachs</p>' + buttons +
    '<p><a href="' + receipt + '">View or print your receipt</a></p>' +
    '<p>Tip: print on A4 paper or open on a tablet. Keep this email, because the links work again whenever you need them.</p>' +
    '<p>Any problem? <a href="' + wa + '">Message us on WhatsApp</a>.</p><p>' + gd_esc_(SCHOOL_NAME) + '</p></div>';
  MailApp.sendEmail({ to: email, name: SCHOOL_NAME, subject: 'Your receipt and download' + (list.length > 1 ? 's' : '') + ' from the Himaayah Store (' + ref + ')', body: text, htmlBody: html });
}

/* ===== PAYMENT ARRIVES (from cardPaymentFromRequest in CardPayments.gs, after the secret check) ===== */
function guideCardPayment_(p) {
  const slugs = String(p.guide || '').split(',').map(gd_slug_).filter(function (s, i, a) { return s && a.indexOf(s) === i; });
  const known = slugs.length > 0 && slugs.length === String(p.guide || '').split(',').filter(String).length;
  const rec = {
    name: String(p.donorName || p.student || '').slice(0, 100), email: String(p.donorEmail || p.email || '').trim().toLowerCase().slice(0, 120), phone: String(p.donorPhone || '').slice(0, 30),
    amount: Number(p.amount) || 0, currency: String(p.currency || '').toUpperCase(), status: String(p.status || '').toUpperCase(),
    eventId: String(p.eventId || ''), checkoutId: String(p.checkoutId || ''), chargeId: String(p.chargeId || ''), ref: String(p.ref || '').trim().toUpperCase().slice(0, 40)
  };
  const need = slugs.reduce(function (n, s) { return n + GD_CAT[s].p; }, 0);
  const paid = known && /^(SUCCEEDED|ACCEPTED|OVERPAID)$/.test(rec.status) && rec.currency === 'NGN' && rec.amount >= need && /^\S+@\S+\.\S+$/.test(rec.email);
  let result = '', send = false;
  const lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    const ss = ss_();
    let log = ss.getSheetByName(CARD_LOG_TAB);
    if (!log) { log = ss.insertSheet(CARD_LOG_TAB); log.getRange(1, 1, 1, CARD_LOG_HEAD.length).setValues([CARD_LOG_HEAD]).setFontWeight('bold'); log.setFrozenRows(1); }
    if (rec.eventId && log.getLastRow() > 1) {
      const ids = log.getRange(2, CARD_LOG_HEAD.indexOf('EventID') + 1, log.getLastRow() - 1, 1).getValues();
      for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === rec.eventId) return { ok: true, duplicate: true };
    }
    if (paid) { result = 'Books emailed: ' + slugs.join(', '); send = true; }
    else if (!known) result = 'Unknown book in the payment: check in Bachs';
    else if (rec.currency === 'NGN' && rec.amount > 0 && rec.amount < need) result = 'Paid less than ' + naira_(need) + ': check in Bachs';
    else if (!/^\S+@\S+\.\S+$/.test(rec.email)) result = 'No valid email: contact the buyer';
    else result = 'Not a completed NGN payment';
    const r = log.getLastRow() + 1;
    log.getRange(r, 1, 1, CARD_LOG_HEAD.length).setNumberFormat('@').setValues([[
      iso_(new Date(), true), rec.ref || 'BOOK', rec.name, 'Books: ' + slugs.join(', '), String(rec.amount), rec.currency, rec.status,
      rec.email, rec.checkoutId, rec.chargeId, rec.eventId, result
    ]]);
  } finally { lock.releaseLock(); }
  let mailed = false;
  if (send) {
    try { gd_sendBooks_(rec.name, rec.email, rec.ref, slugs, rec.amount); mailed = true; } catch (e) { console.error(e); }
  }
  try {
    MailApp.sendEmail({ to: Session.getEffectiveUser().getEmail(), name: SCHOOL_NAME,
      subject: SCHOOL_NAME + ': book sale ' + naira_(rec.amount) + (send && !mailed ? ' (EMAIL FAILED: send manually)' : ''),
      body: 'A children’s book was bought on the website.\n\nBooks: ' + slugs.map(function (s) { return (GD_CAT[s] ? GD_CAT[s].t : s); }).join(', ') + '\nFrom: ' + (rec.name || '-') + ' (' + (rec.email || 'no email') + ', ' + (rec.phone || 'no phone') + ')\nAmount: ' + naira_(rec.amount) + '\nReference: ' + rec.ref + '\nResult: ' + result +
        (send && !mailed ? '\n\nThe download email could NOT be sent. Send these links to the buyer:\n' + slugs.map(function (s) { return GD_CAT[s].t + ': ' + gd_link_(s, rec.ref); }).join('\n') : '') });
  } catch (e) { console.error(e); }
  return { ok: true, result: result };
}
