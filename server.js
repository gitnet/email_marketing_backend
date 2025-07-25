require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const puppeteer = require('puppeteer');
const bodyParser = require('body-parser');
const { chromium } = require('playwright');

const app = express();
const PORT = 5055;

app.use(cors());
app.use(bodyParser.json());

const extractEmailsFromHtml = (html) => {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const mailtoRegex = /mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi;

  const plainEmails = html.match(emailRegex) || [];
  const mailtoEmails = [...html.matchAll(mailtoRegex)].map(match => match[1]);

  return [...new Set([...plainEmails, ...mailtoEmails])];
};

app.get('/api/scrape', async (req, res) => {
  const { q } = req.query;

  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const serpApiKey = process.env.SERPAPI_KEY;  // استبدله بمفتاحك من SerpAPI
   const searchUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&api_key=${serpApiKey}`;
    const response = await axios.get(searchUrl);
    const organicResults = response.data.organic_results || [];

 
    // const browser = await puppeteer.launch({
    //   executablePath: puppeteer.executablePath() , //"/opt/render/.cache/puppeteer/chrome/linux-138.0.7204.168/chrome-linux64/chrome",
    //   headless: true,
    //   args: ['--no-sandbox', '--disable-setuid-sandbox'],
    // });

    // const page = await browser.newPage();
    const browser = await chromium.launch({
        headless: true,
      });
    const page = await browser.newPage();

    const results = [];


    for (let result of organicResults.slice(0, 5)) {
      const url = result.link;
      try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        const html = await page.content();
        const emails = extractEmailsFromHtml(html);
        results.push({ url, emails });
      } catch (err) {
        results.push({ url, emails: [], error: true, message: err.message });
      }
    }

    await browser.close();

    const allEmails = results.flatMap(r => r.emails);
    const uniqueEmails = [...new Set(allEmails)];

    res.json({
      query: q,
      totalFound: uniqueEmails.length,
      emails: uniqueEmails,
      contents: results
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Scraping failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
