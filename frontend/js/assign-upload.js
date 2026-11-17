/* Hand in an assignment as a photo, a Word document or a PDF (student portals).
   HS_UPLOAD.read(file) -> Promise<{ file: base64, ext, fname }>, or rejects with an Error whose message can be shown to the student.
   Photos are shrunk in the browser first so a 12 MB phone picture becomes a few hundred KB. */
(function () {
  'use strict';
  var MAX = 7 * 1024 * 1024, MAX_SIDE = 1800;
  var ALLOWED = ['pdf', 'docx', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'];
  var IMG = ['jpg', 'jpeg', 'png', 'webp'];
  var MSG = {
    type: 'Send a photo (.jpg, .png, .webp), a Word document (.docx) or a PDF.',
    big: 'That file is too large. The limit is 7 MB.',
    read: 'We could not read that file. Please try another.'
  };
  function extOf(name) { var m = /\.([A-Za-z0-9]+)$/.exec(String(name || '')); return m ? m[1].toLowerCase() : ''; }
  function check(name, size) {
    var e = extOf(name);
    if (ALLOWED.indexOf(e) < 0) return MSG.type;
    if (size > MAX) return MSG.big;
    return '';
  }
  function toBase64(blob) {
    return new Promise(function (ok, no) {
      var r = new FileReader();
      r.onload = function () { var s = String(r.result), i = s.indexOf(','); ok(i >= 0 ? s.slice(i + 1) : ''); };
      r.onerror = function () { no(new Error(MSG.read)); };
      r.readAsDataURL(blob);
    });
  }
  function shrink(file) {
    return new Promise(function (ok) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        try {
          var w = img.naturalWidth, h = img.naturalHeight, k = Math.min(1, MAX_SIDE / Math.max(w, h));
          if (k === 1 && file.size < 1.5 * 1024 * 1024) { URL.revokeObjectURL(url); return ok(null); }
          var c = document.createElement('canvas'); c.width = Math.round(w * k); c.height = Math.round(h * k);
          var g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          c.toBlob(function (b) { URL.revokeObjectURL(url); ok(b && b.size < file.size ? b : null); }, 'image/jpeg', 0.85);
        } catch (e) { URL.revokeObjectURL(url); ok(null); }
      };
      img.onerror = function () { URL.revokeObjectURL(url); ok(null); };
      img.src = url;
    });
  }
  function read(file) {
    var bad = check(file && file.name, file && file.size);
    if (!file || bad) return Promise.reject(new Error(bad || MSG.read));
    var e = extOf(file.name), job = IMG.indexOf(e) >= 0 ? shrink(file) : Promise.resolve(null);
    return job.then(function (small) {
      var blob = small || file, ext = small ? 'jpg' : e;
      if (blob.size > MAX) throw new Error(MSG.big);
      return toBase64(blob).then(function (b64) { return { file: b64, ext: ext, fname: file.name }; });
    });
  }
  var api = { read: read, check: check, extOf: extOf, ALLOWED: ALLOWED, MAX: MAX, MSG: MSG };
  if (typeof window !== 'undefined') window.HS_UPLOAD = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined' && window.HS_I18N && window.HS_I18N.add) window.HS_I18N.add({
    'File (optional): a photo, Word document or PDF, up to 7 MB': 'ملف (اختياري): صورة أو مستند وورد أو ملف PDF، حتى ٧ ميغابايت',
    'Send a photo (.jpg, .png, .webp), a Word document (.docx) or a PDF.': 'أرسل صورة (jpg أو png أو webp) أو مستند وورد (docx) أو ملف PDF.',
    'That file is too large. The limit is 7 MB.': 'هذا الملف كبير جدًا. الحد الأقصى ٧ ميغابايت.',
    'We could not read that file. Please try another.': 'تعذّرت قراءة هذا الملف. جرّب ملفًا آخر.',
    'Add a note, a file or a link to your work.': 'أضف ملاحظة أو ملفًا أو رابطًا لعملك.',
    'Your file or link': 'ملفك أو رابطك',
    'Reading your file…': 'جارٍ قراءة ملفك…'
  });
})();
