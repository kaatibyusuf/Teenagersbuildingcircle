/* Himaayah E-Library: the list of outside sources.
   Every entry was opened and read on CHECKED. To add one: open the page, confirm who runs it and that it is Sunni and free to read,
   then add a line below. Keep `by` and `why` to what the site itself says. Do not add a source you have not opened. */
(function () {
  var CHECKED = '2026-11-16';
  var CATS = [
    { id: 'quran',   name: 'Qurʼān',  blurb: 'The text, translations, recitation and the printed muṣḥaf.' },
    { id: 'tafsir',  name: 'Tafsīr',  blurb: 'Explanation of the Qurʼān, read beside the verse.' },
    { id: 'hadith',  name: 'Ḥadīth',  blurb: 'The classical collections, in Arabic and English.' },
    { id: 'fiqh',    name: 'Fiqh',    blurb: 'Rulings and classical texts, including the Mālikī school.' },
    { id: 'seerah',  name: 'Sīrah',   blurb: 'The life of the Prophet ﷺ, in our own guides.' },
    { id: 'journals', name: 'Journals and research', blurb: 'Peer-reviewed papers and research institutes.' }
  ];
  var SOURCES = [
    { id: 'quran-com', cat: 'quran', name: 'Quran.com', url: 'https://quran.com/',
      by: 'Quran Foundation, a non-profit waqf',
      about: 'Read the Qurʼān in Arabic with translations, tafsīr and audio recitation.',
      why: 'Run by a named non-profit (waqf).' },
    { id: 'kfgqpc', cat: 'quran', name: 'King Fahd Glorious Qurʼān Printing Complex', url: 'https://qurancomplex.gov.sa/en/',
      by: 'King Fahd Complex, Madinah (Saudi Ministry of Islamic Affairs)',
      about: 'The Madinah muṣḥaf, with translations and recitations to read or download.',
      why: 'The official printer of the Madinah muṣḥaf.' },
    { id: 'tanzil', cat: 'quran', name: 'Tanzil', url: 'https://tanzil.net/',
      by: 'The Tanzil Project',
      about: 'A carefully verified Unicode Qurʼān text, in Uthmānī and Imlāʼī script, used by many Qurʼān sites and apps.',
      why: 'Its text was checked against the Madinah muṣḥaf by programme and by hand, with help from huffāẓ.' },
    { id: 'quran-com-tafsir', cat: 'tafsir', name: 'Tafsīr on Quran.com', url: 'https://quran.com/1',
      by: 'Quran Foundation, a non-profit waqf',
      about: 'Open any verse, then use the Tafsīr option to read the explanation beside it.',
      why: 'Same named non-profit as Quran.com; the tafsīr sits on the verse itself.' },
    { id: 'sunnah-com', cat: 'hadith', name: 'Sunnah.com', url: 'https://sunnah.com/',
      by: 'Sunnah.com',
      about: 'The classical ḥadīth collections in Arabic and English, searchable by book, chapter and number.',
      why: 'Carries the classical Sunni collections, with the sources cited.' },
    { id: 'seekers', cat: 'fiqh', name: 'SeekersGuidance', url: 'https://seekersguidance.org/',
      by: 'SeekersGuidance',
      about: 'Courses, answers and articles on creed, fiqh and character from traditional teachers.',
      why: 'States that it follows orthodox Sunnism: Ashʿarī and Māturīdī creed and the four madhhabs.' },
    { id: 'risala', cat: 'fiqh', name: 'The Risāla of Ibn Abī Zayd al-Qayrawānī', url: 'https://www.iium.edu.my/deed/lawbase/risalah_maliki/index.html',
      by: 'IIUM Islamic Lawbase, International Islamic University Malaysia',
      about: 'The classic Mālikī primer in English, translated by Bello Daura with commentary, chapter by chapter.',
      why: 'The standard first text of the Mālikī school, hosted by a university. The translator calls it a working translation.' },
    { id: 'shajarah', cat: 'journals', name: 'Al-Shajarah', url: 'https://journals.iium.edu.my/shajarah/',
      by: 'ISTAC, International Islamic University Malaysia',
      about: 'A peer-reviewed journal of Islamic thought and civilisation.',
      why: 'Published by a university institute; each issue is listed with its articles.' },
    { id: 'yaqeen', cat: 'journals', name: 'Yaqeen Institute research papers', url: 'https://yaqeeninstitute.org/read/papers',
      by: 'Yaqeen Institute for Islamic Research, a non-profit',
      about: 'Free papers on the Qurʼān, ḥadīth, the Prophet ﷺ and questions young Muslims ask.',
      why: 'Papers are reviewed by scholars with traditional and academic training and are free to read. The institute describes itself as orthodox, guided by the Qurʼān and Sunnah.' }
  ];
  var OURS = [
    { name: 'Ḥadīth Bootcamp', url: 'hadith-bootcamp', about: 'The Forty Ḥadīth of an-Nawawī at your own pace, with audio lessons.' },
    { name: 'Guides in the Himaayah Store', url: 'store', about: 'Mālikī fiqh, Sīrah, tafsīr of Juz ʿAmma, adhkār and more, written by our teachers.' },
    { name: 'Student dictionary', url: 'dictionary', about: 'The Arabic and Islamic words used in class, explained simply.' }
  ];
  var api = { CHECKED: CHECKED, CATS: CATS, SOURCES: SOURCES, OURS: OURS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (typeof window !== 'undefined') window.ELIB = api;
})();
