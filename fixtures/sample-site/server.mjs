#!/usr/bin/env node
/**
 * Chai & Code Café - a second demo website for "connect any site" (Dev D fixture).
 *
 * A separate, independently running site that PATCHWORK has never seen: it is connected from the
 * Sites screen by its address. Like many real sites it forbids being framed (X-Frame-Options,
 * frame-ancestors) and sends a strict Content-Security-Policy, so it also proves the gateway's
 * handling of real-world headers. It has real problems to fix without touching this file:
 *   - the "Book a table" button links to /bookings, which does not exist (the page is /book)
 *   - the "Monsoon special ends 30 Sep" announcement is out of date
 *   - the phone number in the footer has a digit missing
 *
 * Zero dependencies. Port: PW_SAMPLE_PORT (default 5500).
 */
import { createServer } from 'node:http';

const HOST = process.env.PW_SAMPLE_HOST ?? '127.0.0.1';
const PORT = Number(process.env.PW_SAMPLE_PORT ?? 5500);

const CSS = `
  body { margin: 0; font-family: Georgia, 'Times New Roman', serif; background: #fbf7f0; color: #2b1d12; }
  header { display: flex; justify-content: space-between; align-items: center; padding: 18px 40px; background: #3b2416; color: #fbe9d0; }
  header a { color: #fbe9d0; margin-left: 18px; text-decoration: none; }
  .logo { font-size: 22px; font-weight: bold; letter-spacing: 0.02em; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 24px 60px; }
  .notice { background: #f6d58e; border: 1px solid #d9a93f; padding: 12px 16px; border-radius: 6px; margin-bottom: 24px; }
  h1 { font-size: 40px; margin: 0 0 8px; }
  .lead { font-size: 19px; color: #5c4430; }
  .cta { display: inline-block; margin-top: 18px; padding: 12px 22px; background: #b5502c; color: #fff; border-radius: 6px; text-decoration: none; font-family: system-ui, sans-serif; font-weight: 600; }
  .menu { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 28px; }
  .item { background: #fff; border: 1px solid #ead9c2; border-radius: 8px; padding: 16px; }
  .item h3 { margin: 0 0 6px; }
  .item .price { font-family: system-ui, sans-serif; font-weight: 700; color: #b5502c; }
  footer { border-top: 1px solid #ead9c2; padding: 20px 40px; color: #6b5440; font-family: system-ui, sans-serif; font-size: 14px; }
`;

const layout = (title, body) => `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} · Chai &amp; Code Café</title>
  <style>${CSS}</style>
</head>
<body>
  <header>
    <span class="logo">Chai &amp; Code Café</span>
    <nav><a href="http://localhost:${PORT}/">Home</a><a href="http://localhost:${PORT}/menu">Menu</a><a href="http://localhost:${PORT}/book">Book</a></nav>
  </header>
  <main>${body}</main>
  <footer>Open 8 am – 10 pm · Koregaon Park, Pune · Call us: <span class="phone">+91 98220 1234</span></footer>
</body>
</html>`;

const pages = {
  '/': layout(
    'Home',
    `<div class="notice" id="announcement">Monsoon special: 20% off masala chai, ends 30 Sep</div>
     <h1 id="hero">Good chai, fast Wi-Fi.</h1>
     <p class="lead">A quiet corner for coders, writers and anyone who needs a second cup.</p>
     <a class="cta" href="/bookings">Book a table</a>
     <section class="menu" aria-label="Favourites">
       <article class="item"><h3>Masala chai</h3><p>Ginger, cardamom, a little pepper.</p><p class="price">₹90</p></article>
       <article class="item"><h3>Filter coffee</h3><p>South Indian, brewed strong.</p><p class="price">₹110</p></article>
       <article class="item"><h3>Bun maska</h3><p>Soft bun, too much butter.</p><p class="price">₹70</p></article>
     </section>`,
  ),
  '/menu': layout(
    'Menu',
    `<h1>Menu</h1>
     <section class="menu" aria-label="Menu">
       <article class="item"><h3>Masala chai</h3><p class="price">₹90</p></article>
       <article class="item"><h3>Cutting chai</h3><p class="price">₹40</p></article>
       <article class="item"><h3>Filter coffee</h3><p class="price">₹110</p></article>
       <article class="item"><h3>Bun maska</h3><p class="price">₹70</p></article>
       <article class="item"><h3>Vada pav</h3><p class="price">₹60</p></article>
     </section>`,
  ),
  '/book': layout(
    'Book a table',
    `<h1>Book a table</h1><p class="lead">Call us or walk in: tables for 1 to 6 people.</p>`,
  ),
};

createServer((req, res) => {
  const path = (req.url ?? '/').split('?')[0];
  const headers = {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    // like many real sites: no framing, strict policy (PATCHWORK's gateway adapts both)
    'x-frame-options': 'DENY',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
  };
  const body = pages[path];
  if (!body) {
    res.writeHead(404, headers);
    res.end(layout('Not found', `<h1>Page not found</h1><p class="lead">There is no page at ${path.replace(/[<>&"]/g, '')}.</p>`));
    return;
  }
  res.writeHead(200, headers);
  res.end(body);
}).listen(PORT, HOST, () => {
  console.log(`[chai & code] listening on http://${HOST === '127.0.0.1' ? 'localhost' : HOST}:${PORT}`);
});
