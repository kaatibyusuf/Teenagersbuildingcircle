/**
 * One-time import of staff bank details from the "Himaayah Staff Registration" form.
 * Run importStaffBanks() once from the Apps Script editor, read the log, then DELETE this file
 * (it holds account numbers). Only EMPTY bank fields are filled; anything you already saved is kept.
 * Staff are matched by email, then phone number, then full name.
 */
const SB_ROWS = [
[
"Ayman Titilope Abduroheem",
"aymanabduroheem@gmail.com",
"7047316678",
"Opay",
"7047316678",
"Ayman Titilope Abduroheem"
],
[
"Abdullahi Adekunle Adedokun",
"adedokunabdullahi434@gmail.com",
"7025842849",
"Opay",
"9159475156",
"Abdullahi Adedokun"
],
[
"Iraadatullah Bello",
"belloiraadatullah@gmail.com",
"9134586282",
"Kuda",
"2084005270",
"Iraadatullah Bello"
],
[
"Yusuf Isiaq Abdqawiyu",
"abdqawiyy03@gmail.com",
"7049464312",
"Opay",
"7049464312",
"Yusuf Isiaq Abdqawiyu"
],
[
"Adeoye Ubaidah",
"adeoyeubaidah1@gmail.com",
"8029851538",
"Kuda",
"2049069318",
"Adeoye Ubaidah A"
],
[
"Adeoye Sarah Adelayo",
"adelayoadeoye@gmail.com",
"7080585354",
"First Bank",
"3192130407",
"Adeoye Sarah Adelayo"
],
[
"Aishah Abduroheem",
"aishahabdurroheem@gmail.com",
"7041629679",
"Opay",
"7041629679",
"Aishah Abduroheem Motunrayo"
],
[
"Odunmbaku Aaishah",
"aashodunmbaku@gmail.com",
"9060462958",
"Opay",
"9060462958",
"Odunmbaku Aaishah"
],
[
"Bello Sherifah Ayomide",
"bellosherifahayomide@gmail.com",
"9017752716",
"Opay",
"9017752716",
"Bello Sherifah Ayomide"
],
[
"Dauda Mubarak Abiodun",
"daudamubarakabiodun@gmail.com",
"8156711935",
"GTBank",
"0544581237",
"Dauda Mubarak Abiodun"
],
[
"Abdulwahab Habeeblahi",
"102009aki@gmail.com",
"9135841344",
"Opay",
"9135841344",
"Abdulwahab Akintunde Habeeblahi"
],
[
"ABDULHAMMED BALIKIS",
"balikisidowu227@gmail.com",
"8132333854",
"Opay",
"9038261778",
"ABDULHAMMED BALIKIS TEMILADE"
],
[
"Adekanmbi Aisha Omolara",
"adekanmbiaishaomolara@gmail.com",
"7058079409",
"Moniepoint",
"9078751010",
"Adekanmbi Aisha Omolara"
],
[
"Dhikrullah Oluwatobiloba Olusanya",
"tobiolusanya02@gmail.com",
"9025199054",
"GTBank",
"0895417740",
"Dhikrullah Olusanya"
],
[
"Lawal Zaynab Titilope",
"titilopelawal10@gmail.com",
"7066095416",
"Opay",
"7066095416",
"Lawal Zaynab Titilope"
],
[
"Hambali Habībah Ayomide",
"hambalihabibah207@gmail.com",
"7062750418",
"Opay",
"7062750418",
"Hambali Habībah Ayomide"
],
[
"Hadiyatullah Aishah Kehinde",
"aishahkehinde01@gmail.com",
"9168236236",
"Lotus Bank",
"1002722363",
"Hadiyatullah Aisha Kehinde"
],
[
"Jibril-Adeyemi Saalih 'Uthaymeen",
"jibriladeyemisaalihuthaymeen@gmail.com",
"9136121525",
"Opay",
"9136121525",
"Jibril-Adeyemi Saalih 'Uthaymeen"
],
[
"Aisha Dhikrullah",
"aishaatinuke160@gmail.com",
"8145914762",
"Opay",
"8145914762",
"Aisha Atinuke Dhikrullah"
],
[
"AMOBI Abdulsomad Olaide",
"olaideabdulsomad@gmail.com",
"8107137281",
"Jaiz Bank",
"0008768694",
"Abdulsomad Olaide Amobi"
],
[
"Habeebah Misbahudeen",
"habeebahmisbahudeen@gmail.com",
"8039918620",
"Opay",
"8039918620",
"Misbahudeen Habeebah"
],
[
"Sanyaolu Fawziyah",
"sanyaolufawzy@gmail.com",
"8130468183",
"Jaiz Bank",
"0017318563",
"Sanyaolu Fawziyah Oluwatobiloba"
],
[
"Salamah Nuh Lawal",
"lawalsalamah@gmail.com",
"8147707047",
"Opay",
"8147707047",
"Salamah Lawal"
],
[
"Abdulsalam Sherifat Oluwabukola",
"abdulsalamsherifat80@gmail.com",
"8108759578",
"GTBank",
"0888791479",
"Abdulsalam Sherifat Oluwabukola"
],
[
"Faatimah Abdrahman Ayomide",
"faatimahabdrahman5@gmail.com",
"8025990136",
"Opay",
"8025990136",
"Faatimah Abdrahman Ayomide"
],
[
"Hikmat Oyenekan",
"ht.oyenekan@gmail.com",
"9137974120",
"Opay",
"9137974120",
"Hikmat Oyenekan"
],
[
"Balogun Sheriff Oladimeji",
"dimejisheriff@gmail.com",
"9031656291",
"Opay",
"9038222100",
"Balogun Sheriff Oladimeji"
]
]; // [name, email, phone(last 10 digits), bank, account number, account name]

function importStaffBanks() {
  const norm = function (s) { return String(s || '').toLowerCase().replace(/[^a-z]/g, ''); };
  const tail = function (s) { return String(s || '').replace(/\D/g, '').slice(-10); };
  const log = [], used = {};
  SAL_SOURCES.forEach(function (src) {
    let T; try { T = table_(src.tab); } catch (e) { return; }
    sal_ensure_(src.tab, SAL_STAFF_COLS);
    T = table_(src.tab);
    T.rows.forEach(function (t) {
      const email = String(t.Email || '').trim().toLowerCase(), ph = tail(t.WhatsApp || t.Phone), nm = norm(t.Name);
      let hit = null;
      SB_ROWS.forEach(function (r, i) { if (!hit && email && r[1] === email) hit = i; });
      SB_ROWS.forEach(function (r, i) { if (hit === null && ph.length === 10 && r[2] === ph) hit = i; });
      SB_ROWS.forEach(function (r, i) { if (hit === null && nm && norm(r[0]) === nm) hit = i; });
      if (hit === null) return;
      const r = SB_ROWS[hit]; used[hit] = 1;
      const filled = [];
      [['BankName', r[3]], ['AccountNumber', r[4]], ['AccountName', r[5]]].forEach(function (f) {
        if (!String(t[f[0]] || '').trim()) { put_(T, t._row, f[0], f[1], true); filled.push(f[0]); }
      });
      log.push((filled.length ? 'FILLED ' : 'already had details: ') + t.Name + ' [' + src.tab + ']' + (filled.length ? ' (' + filled.join(', ') + ')' : ''));
    });
  });
  SB_ROWS.forEach(function (r, i) { if (!used[i]) log.push('NOT FOUND in any staff tab: ' + r[0] + ' (' + r[1] + ') - add them to their tab or enter details in the owner portal'); });
  Logger.log(log.join('\n'));
  return log;
}
