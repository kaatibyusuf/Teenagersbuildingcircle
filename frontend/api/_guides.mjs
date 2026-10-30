// The paid children's books. Price is set here (server side) so it can't be changed in the browser.
// The PDFs live in api/_paid under random names and are only ever sent by api/guide-download, to a valid signed link.
// To add a book: put its PDF in api/_paid, add a line here, and add the same slug to GUIDES in backend/Guides.gs.
import crypto from 'node:crypto';

export const PRICE = 5000; // naira per book (each book can also have its own price below)
export const GUIDES = {
  'my-first-arabic-letters': { title: "My First Arabic Letters", file: '9e23aef0a8c8c3ed893f.pdf', price: PRICE },
  'i-can-pray': { title: "I Can Pray!", file: 'a47e24b985cdaad19c58.pdf', price: PRICE },
  'little-muslims-beautiful-manners': { title: "Little Muslims, Beautiful Manners", file: 'e3caded0067433e86a8c.pdf', price: PRICE },
  'my-ramadan-and-eid-book': { title: "My Ramadan and Eid Book", file: '7d9e4017d7648a44a8c5.pdf', price: PRICE },
};

// The signed token for one purchase of one book. Apps Script makes the same token (Guides.gs gd_token_) when it emails the link.
export const token = (secret, slug, ref) => crypto.createHmac('sha256', secret).update('guide|' + slug + '|' + ref).digest('hex').slice(0, 40);

// Receipt links: Apps Script signs a small JSON payload (receipt number, buyer, date, books, amount) so a receipt can't be forged.
export const sign = (secret, d) => crypto.createHmac('sha256', secret).update('receipt|' + d).digest('hex').slice(0, 40);
