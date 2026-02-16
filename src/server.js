// src/server.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const fetcher = require('./utils/fetcher');
const ai = require('./utils/ai');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());

// Define paths
const sourcesPath = path.join(__dirname, 'data/sources.json');
const articlesPath = path.join(__dirname, 'data/articles.json');

// ---------- Initialize data files ----------
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(sourcesPath)) {
  fs.writeFileSync(sourcesPath, '[]');
}
if (!fs.existsSync(articlesPath)) {
  fs.writeFileSync(articlesPath, '[]');
}

// ---------- API ----------
// 1️⃣ Get current sources
app.get('/api/sources', (req, res) => {
  try {
    const src = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
    res.json(src);
  } catch (e) {
    console.error('Error reading sources:', e);
    res.status(500).json({ error: 'Failed to read sources' });
  }
});

// 2️⃣ Add a new source
app.post('/api/sources', (req, res) => {
  try {
    const { name, url, type } = req.body;
    if (!name || !url || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
    const id = Date.now();
    sources.push({ id, name, url, type, enabled: true });
    fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2));
    res.json({ success: true, id });
  } catch (e) {
    console.error('Error adding source:', e);
    res.status(500).json({ error: 'Failed to add source' });
  }
});

// 2b️⃣ Delete a source
app.delete('/api/sources/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    let sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
    sources = sources.filter(s => s.id !== id);
    fs.writeFileSync(sourcesPath, JSON.stringify(sources, null, 2));
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting source:', e);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

// 3️⃣ Get the feed (latest articles)
app.get('/api/feed', (req, res) => {
  try {
    const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));
    // newest first
    articles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    res.json(articles);
  } catch (e) {
    console.error('Error reading articles:', e);
    res.status(500).json({ error: 'Failed to read articles' });
  }
});

// 4️⃣ Stock data endpoint (using mock data for demo)
const mockStockData = {
  'TSLA': { price: 248.50, change: 5.25, changePercent: 2.16 },
  'BTC-USD': { price: 67432.18, change: 1234.56, changePercent: 1.87 },
  'TOY.TO': { price: 42.35, change: -0.85, changePercent: -1.97 },
  '^GSPC': { price: 5823.45, change: 15.30, changePercent: 0.26 }
};

app.get('/api/stock/:symbol', (req, res) => {
  try {
    const symbol = req.params.symbol;
    const mockData = mockStockData[symbol];
    
    if (!mockData) {
      return res.status(404).json({ error: 'Symbol not found' });
    }
    
    // Generate 30 days of mock historical data
    const prices = [];
    const timestamps = [];
    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    
    for (let i = 29; i >= 0; i--) {
      timestamps.push(Math.floor((now - i * oneDay) / 1000));
      // Random price around the current price
      const randomVariation = (Math.random() - 0.5) * mockData.price * 0.1;
      prices.push(mockData.price + randomVariation);
    }
    
    res.json({
      chart: {
        result: [{
          meta: {
            symbol: symbol,
            regularMarketPrice: mockData.price
          },
          timestamp: timestamps,
          indicators: {
            quote: [{
              close: prices
            }]
          }
        }]
      }
    });
  } catch (e) {
    console.error('Error generating stock data:', e);
    res.status(500).json({ error: 'Failed to generate stock data' });
  }
});

// ---------- Scheduler ----------
let isRunning = false;
const MAX_ARTICLES = 200;

cron.schedule('*/10 * * * *', async () => {
  if (isRunning) {
    console.log('Previous fetch still running, skipping...');
    return;
  }
  
  isRunning = true;
  console.log('Starting scheduled fetch...');
  
  try {
    const sources = JSON.parse(fs.readFileSync(sourcesPath, 'utf8'));
    let articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));

    for (const src of sources.filter(s => s.enabled)) {
      try {
        console.log(`Fetching from ${src.name}...`);
        const items = await fetcher.fetchSource(src);
        
        for (const it of items) {
          // skip if already stored (by link)
          if (articles.find(a => a.link === it.link)) continue;

          const summary = await ai.summarize(it.content);
          articles.push({
            sourceId: src.id,
            sourceName: src.name,
            title: it.title,
            link: it.link,
            published_at: it.published,
            summary,
            fetched_at: new Date().toISOString()
          });
        }
      } catch (e) {
        console.error(`Error processing ${src.name}:`, e.message);
      }
    }

    // Keep only the most recent articles
    if (articles.length > MAX_ARTICLES) {
      articles = articles
        .sort((a, b) => new Date(b.fetched_at) - new Date(a.fetched_at))
        .slice(0, MAX_ARTICLES);
    }

    fs.writeFileSync(articlesPath, JSON.stringify(articles, null, 2));
    console.log(`Fetch complete. Total articles: ${articles.length}`);
  } catch (e) {
    console.error('Error in scheduled fetch:', e.message);
  } finally {
    isRunning = false;
  }
});

// ---------- Serve the frontend ----------
app.use(express.static(path.join(__dirname, '../public')));

// Catch-all for SPA routing
app.use((req, res) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('<h1>404 - Not Found</h1>');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log('Cron job scheduled: fetching articles every 10 minutes');
});