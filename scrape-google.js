// scraper.js
const puppeteer = require("puppeteer");
const axios = require("axios");
const cheerio = require("cheerio");

/**
 * 1. Fetch URLs from Google search results matching query
 */
async function fetchSearchResultUrls(query, maxResults = 5) {
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  const { data: html } = await axios.get(searchUrl, {
    headers: {  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
    'Connection': 'keep-alive', }
  });
  const $ = cheerio.load(html);
  const links = [];

  $('a[href^="/url?q="]').each((i, el) => {
    if (links.length >= maxResults) return;
    const href = $(el).attr('href');
    const url = href.match(/\/url\?q=([^&]+)/);
    if (url && url[1].startsWith('http')) links.push(decodeURIComponent(url[1]));
  });

  return links;
}

/**
 * 2. Scrape emails from those URLs using Puppeteer
 */
function extractEmailsFromText(text) {
  const regex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
  return text.match(regex) || [];
}

async function scrapeEmailsFromUrls(urls) {
  const browser = await puppeteer.launch({ headless: true });
  const results = [];
  let allEmails = [];

  for (const url of urls) {
    const page = await browser.newPage();
    try {
      await page.goto(url, { waitUntil: "networkidle2", timeout: 30000 });

      const bodyText = await page.evaluate(() => document.body.innerText || "");
      const visibleEmails = extractEmailsFromText(bodyText);

      const mailtoLinks = await page.$$eval('a[href^="mailto:"]', els =>
        els.map(el => el.href.replace(/^mailto:/, '').split('?')[0])
      );

      const unique = Array.from(new Set([...visibleEmails, ...mailtoLinks]));
      results.push({ url, emails: unique });

      allEmails = allEmails.concat(unique);
    } catch (err) {
      results.push({ url, error: true, message: err.message });
    } finally {
      await page.close();
    }
  }

  await browser.close();

  return {
    totalFound: new Set(allEmails).size,
    emails: Array.from(new Set(allEmails)),
    contents: results
  };
}

/**
 * 3. Master function
 */
async function scrapeFromSearch(query) {
  const urls = await fetchSearchResultUrls(query);
  const data = await scrapeEmailsFromUrls(urls);
  return data;
}

module.exports = { scrapeFromSearch };
