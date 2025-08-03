require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const bodyParser = require('body-parser');
const compression = require('compression');


const app = express();
const PORT = process.env.PORT || 8080;

// Puppeteer setup (auto-detect local vs AWS Lambda)
const isLambda = !!process.env.AWS_LAMBDA_FUNCTION_NAME;
const puppeteer = isLambda ? require('puppeteer-core') : require('puppeteer');
const chromium = isLambda ? require('chrome-aws-lambda') : null;

app.use(cors());
app.use(bodyParser.json());
app.use(compression());

const extractEmailsFromHtml = (html) => {
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
  const mailtoRegex = /mailto:([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/gi;

  const plainEmails = html.match(emailRegex) || [];
  const mailtoEmails = [...html.matchAll(mailtoRegex)].map(match => match[1]);

  return [...new Set([...plainEmails, ...mailtoEmails])];
};

app.get('/api/scrape', async (req, res) => {
  const { q , num} = req.query;

  if (!q) return res.status(400).json({ error: 'Missing query' });

  try {
    const serpApiKey = process.env.SERPAPI_KEY;
    const searchUrl = `https://serpapi.com/search.json?q=${encodeURIComponent(q)}&num=${num}&api_key=${serpApiKey}`;
    const response = await axios.get(searchUrl);
    const organicResults = response.data.organic_results || [];

    // Launch Puppeteer
    const browser = await puppeteer.launch(
      isLambda
        ? {
            args: chromium.args,
            executablePath: await chromium.executablePath,
            headless: chromium.headless,
          }
        : {
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox'],
          }
    );

    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 720 });
    
    await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'media', 'stylesheet', 'font'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });



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
      contents: results,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Scraping failed', details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
