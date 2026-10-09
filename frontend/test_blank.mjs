import puppeteer from 'puppeteer';

(async () => {
  try {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    page.on('console', msg => console.log('PAGE LOG:', msg.text()));
    page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
    page.on('requestfailed', req => console.log('REQ FAIL:', req.url(), req.failure()?.errorText));
    await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle2' });
    await browser.close();
    console.log("Done");
  } catch (e) {
    console.log("Error:", e.message);
  }
})();
