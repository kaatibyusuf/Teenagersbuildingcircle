// Haaris without AI: fixed answers from the school information, chosen by topic or keyword.
// Used automatically when ANTHROPIC_API_KEY is missing or Claude cannot be reached (for example billing is not active),
// and always when the Vercel variable HAARIS_MODE is set to "menu".
// The wording below comes from the 2026-2027 prospectus (knowledge.md). When fees or policies change, update this file too.
import { LINES } from './core.mjs';

const SITE = 'himaayahschools.com';
const NOTE = '\n\nFees and availability can change; ' + SITE + ' always shows the latest.';
const line = (k) => `${LINES[k].name}: +${LINES[k].phone.replace(/^234(\d{3})(\d{3})(\d{4})$/, '234 $1 $2 $3')}`;

const FEES = 'Fees (Nigerian naira)\n\nMadrasah, monthly\n- Hifdh Only (Group): ₦12,000 (waitlist)\n- Full Madrasah (Group): ₦20,000, or ₦15,000 after hifdh (waitlist)\n- Hifdh Only (Personal): ₦20,000 (open)\n- Full Madrasah (Personal): ₦35,000 (open)\n- One-Year Hifdh: ₦19,000 a month for 12 months (waitlist)\n- Muraajah (Group): ₦14,000 (open)\n- Muraajah (Personal): ₦20,000 (open)\n\nAcademy, monthly (all open)\n- UTME (JAMB) Prep: ₦10,000\n- Post-UTME Masterclass: ₦10,000\n- O-Levels Prep (WAEC and NECO): ₦10,000\n- A-Levels Prep (IJMB, JUPEB, Cambridge): ₦10,000\n\nSkills School (open)\n- Public Speaking, 4 weeks: ₦25,000\n- Graphic Design, 6 weeks: ₦35,000\n- Data Analysis, 8 weeks: ₦80,000, paid every 2 months\n\nTeenagers Building Circle (ages 13 to 19, open)\n- Full programme: ₦40,000 a month\n\nEvery new enrolment also pays a one-time ₦3,000 registration fee on the first payment.' + NOTE;
const PROGRAMMES = 'Himaayah Schools runs four programmes, all live online.\n\nMadrasah: Qur\'an, hifdh and Islamic knowledge, from Rawdah to Iʿdādiyyah levels. Classes on Google Meet and Telegram.\n\nAcademy: UTME, Post-UTME, WAEC, NECO and A-Levels (IJMB, JUPEB, Cambridge). Live classes with recordings.\n\nSkills School: Public Speaking, Graphic Design and Data Analysis.\n\nTeenagers Building Circle: a programme for ages 13 to 19, live on Google Meet.\n\nTo see plans and fees, choose Fees. To join, choose How to enrol.';
const ENROL = 'How to enrol (about two minutes)\n\n1. Choose your programme. Not sure? Take a free placement test or message us.\n2. Get placed at the right level (Madrasah has an Arabic placement test; the Circle starts with a diagnostic assessment).\n3. Fill in the form at ' + SITE + '/enroll.html.\n4. Pay by card or bank transfer.\n5. After a transfer, send your receipt on WhatsApp. When payment is confirmed we email the Student ID and access code for the dashboard.\n\nA place is only confirmed once we receive the payment. Students under 18 need a parent or guardian to complete the next-of-kin details.';
const PAY = 'How to pay\n\nBy card: at the last step of enrolment, or any time at ' + SITE + '/pay.html.\n\nBy bank transfer: Wema Bank, Himaayah Ltd, 0127584920. Then send the receipt on WhatsApp to your programme\'s line (Madrasah, Academy or General), using the message the enrolment page prepares.\n\nOn monthly plans you can pay for 1, 2, 3, 6 or 12 months at once. We usually confirm payments within a few hours.';
const PLACEMENT = 'Placement tests\n\nTake them at ' + SITE + '/placement.html.\n\nMadrasah: an Arabic placement test for your level. Ibtidā\'iyyah levels need 75% to 90%; entry levels need no minimum score.\n\nAcademy: a free UTME placement test (Science or Arts, 70% cut-off) shows where you stand. You can enrol whatever you score.\n\nTeenagers Building Circle: a diagnostic assessment before the cohort begins.';
const REFUNDS = 'Refunds\n\n- Before classes start: you may request a refund at any time.\n- In the first two weeks of classes: you may request a refund and we will process it.\n- After two weeks: no refund, unless the error is ours.\n- If we cancel a class or cohort and cannot offer an alternative: you are refunded for that period.\n\nThe ₦3,000 registration fee is not refundable, and payment provider charges are deducted from refunds. Full policy: ' + SITE + '/policies.html';
const WAITLIST = 'Waitlist\n\nSome plans, such as group classes, close when full. Joining the waitlist is free, does not take a place and does not oblige either side. When a place opens we contact families in the order they joined, and a place is confirmed only when you pay. If we hear nothing within 7 days of offering a place, it may go to the next family. Join at ' + SITE + '.';
const CONTACT = 'Talk to our team\n\n' + line('madrasah') + ' (Madrasah)\n' + line('academy') + ' (Academy)\n' + line('general') + ' (Skills School, Circle, fees and anything else)\n\nCalls and WhatsApp. Email: hello@himaayahschools.com\nWebsite: ' + SITE;
const LOGIN = 'Student ID and access code\n\nWe email your Student ID and access code once your payment is confirmed. Sign in from the Login menu at ' + SITE + '. If you have lost them or the code does not work, message the line for your programme:\n\n' + line('madrasah') + '\n' + line('academy') + '\n' + line('general');

const CHIPS_PUBLIC = [['Fees', 'topic:fees'], ['How to enrol', 'topic:enrol'], ['Programmes', 'topic:programmes'], ['Placement test', 'topic:placement'], ['How to pay', 'topic:pay'], ['Talk to our team', 'topic:contact']];
const CHIPS_ACCOUNT = [['My fees', 'topic:myfees'], ['My next class', 'topic:myclass'], ['My assignments', 'topic:myassign'], ['My results', 'topic:myresults'], ['Announcements', 'topic:mynews']];
const chips = (list) => list.map(([label, text]) => ({ label, text }));

const day = (d) => { const m = String(d || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : ''; };
const when = (d) => { const t = String(d || ''); if (!t) return ''; const [date, time] = t.split('T'); return day(date) + (time && time !== '00:00' ? ' at ' + time : ''); };
const naira = (n) => '₦' + String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');

const ACCOUNT = {
  myfees: (a) => `Your fees, ${a.name}\n\nStatus: ${a.fee.status || 'not available'}${a.fee.nextDue ? '\nNext due: ' + day(a.fee.nextDue) : ''}${a.fee.monthly ? '\nMonthly fee: ' + naira(a.fee.monthly) : ''}${a.fee.classesLocked ? '\n\nYour fee is overdue, so class links are paused until payment is applied.' : ''}\n\nPay at ${SITE}/pay.html with your Student ID ${a.studentId}.${(a.payments || []).length ? '\n\nRecent payments: ' + a.payments.map((p) => `${day(p.date)} ${naira(p.amount)}`).join('; ') : ''}`,
  myclass: (a) => a.nextClass ? `Your next class is ${when(a.nextClass)}.${a.classLink ? '\nJoin: ' + a.classLink : ''}${a.fee.classesLocked ? '\nClass links are paused because your fee is overdue.' : ''}` : 'There is no class scheduled for you yet. Your teacher will set it.',
  myassign: (a) => (a.assignments || []).length ? 'Your assignments\n\n' + a.assignments.map((x) => `- ${x.title}: ${x.status}${x.due ? ', due ' + day(x.due) : ''}${x.score ? ', score ' + x.score : ''}`).join('\n') + '\n\nSubmit them on your dashboard.' : 'You have no assignments right now.',
  myresults: (a) => (a.results || []).length ? 'Your latest results\n\n' + a.results.map((r) => `- ${r.subject} (${r.type || 'test'}), ${day(r.date)}: ${r.score}`).join('\n') : 'No results are recorded for you yet.',
  mynews: (a) => (a.announcements || []).length ? 'Latest announcements\n\n' + a.announcements.map((x) => `- ${day(x.date)}: ${x.title}`).join('\n') + '\n\nThe full text is on your dashboard.' : 'There are no announcements right now.',
};
const TOPICS = { fees: FEES, enrol: ENROL, programmes: PROGRAMMES, placement: PLACEMENT, pay: PAY, refunds: REFUNDS, waitlist: WAITLIST, contact: CONTACT, login: LOGIN };

const RULES = [
  [/\b(my|mine)\b.*\b(fee|fees|payment|payments|due|balance)\b|\bwhen.*(fee|payment).*due\b/, 'myfees'],
  [/next class|my class|\bwhen.*(is|are).*(class|lesson)|class link|join.*class/, 'myclass'],
  [/assignment|homework/, 'myassign'],
  [/\b(my )?(result|results|score|scores|grade|grades)\b/, 'myresults'],
  [/announce|notice|news/, 'mynews'],
  [/refund|money back/, 'refunds'],
  [/wait ?list/, 'waitlist'],
  [/access code|student id|password|log ?in|login|sign ?in|forgot|reset/, 'login'],
  [/placement|entrance test|assessment/, 'placement'],
  [/how (do|can|to) (i )?pay|bank|transfer|card|account number|wema|pay ?ahead|receipt/, 'pay'],
  [/fee|fees|price|prices|cost|how much|naira|₦|tuition/, 'fees'],
  [/enrol|enroll|join|register|registration|admission|apply|sign up/, 'enrol'],
  [/programme|program\b|madrasah|hifdh|quran|qur'an|academy|utme|jamb|waec|neco|ijmb|jupeb|cambridge|a-level|skills|speaking|graphic|data analysis|teenager|circle|course/, 'programmes'],
  [/contact|human|person|staff|team|call|phone|whatsapp|number|email|speak to|talk to|complain/, 'contact'],
];
const ACCOUNT_KEYS = ['myfees', 'myclass', 'myassign', 'myresults', 'mynews'];
const GREET = /^(hi|hello|hey|salaam|salam|assalaam\S*|as-?salaam\S*|menu|help|start|options|good (morning|afternoon|evening))\b/;

/** text: what the person typed or the chip value ("topic:fees"). account: the signed-in summary or null. Returns { text, chips }. */
export function menuReply(text, account) {
  const t = String(text || '').trim().toLowerCase().slice(0, 300);
  const mainChips = chips(account ? [...CHIPS_ACCOUNT, ...CHIPS_PUBLIC] : CHIPS_PUBLIC);
  const intro = (account ? `Assalaamu alaykum ${String(account.name || '').split(' ')[0]}. ` : 'Assalaamu alaykum. ') + 'I am Haaris, the Himaayah Schools assistant (an AI, not a person). Choose a topic below.';
  if (!t || GREET.test(t) && t.length < 25) return { text: intro, chips: mainChips };
  let key = t.startsWith('topic:') ? t.slice(6) : '';
  if (!key) { for (const [re, k] of RULES) if (re.test(t)) { key = k; break; } }
  if (ACCOUNT_KEYS.includes(key)) {
    if (!account) return { text: 'To see your own fees, classes, assignments or results, sign in to your dashboard on ' + SITE + ' and open this chat there, or connect Telegram from your dashboard. For anything else, choose a topic below.', chips: chips(CHIPS_PUBLIC) };
    return { text: ACCOUNT[key](account), chips: mainChips };
  }
  if (TOPICS[key]) return { text: TOPICS[key], chips: mainChips };
  return { text: 'I can answer on these topics right now. Please choose one, or talk to our team.\n\n' + line('general'), chips: mainChips };
}
