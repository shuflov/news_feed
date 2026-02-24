require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const Parser = require('rss-parser');
const { initializeDatabase, saveDatabase, userQueries, sourceQueries, articleQueries } = require('./database');

const app = express();
const parser = new Parser();

const isProduction = process.env.NODE_ENV === 'production';

app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://shuflov.github.io',
    'http://localhost:3000'
  ];
  
  if (allowedOrigins.includes(origin) || !isProduction) {
    res.setHeader('Access-Control-Allow-Origin', origin || '*');
  } else {
    res.setHeader('Access-Control-Allow-Origin', 'https://shuflov.github.io');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'news-feed-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: isProduction,
    httpOnly: true,
    sameSite: isProduction ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000
  }
}));

function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

async function summarizeArticle(content) {
  if (!content) return '';
  return content.substring(0, 150);
}

async function fetchSource(source) {
  if (source.type === 'rss') {
    const feed = await parser.parseURL(source.url);
    return feed.items.map(i => ({
      title: i.title,
      link: i.link,
      published: i.pubDate,
      content: i.contentSnippet || i.content || ''
    }));
  }
  return [];
}

const STOCKS = ['TSLA', 'BTC-USD', 'TOY.TO', '^GSPC'];

async function fetchYahooFinance(symbol) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`;
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    if (data.chart && data.chart.result && data.chart.result[0]) {
      const result = data.chart.result[0];
      const meta = result.meta;
      const prices = result.indicators.quote[0].close;

      const currentPrice = meta.regularMarketPrice || prices[prices.length - 1];
      const previousPrice = prices[prices.length - 2] || currentPrice;

      if (!currentPrice || !previousPrice || previousPrice === 0) {
        throw new Error('Invalid price data');
      }

      const change = currentPrice - previousPrice;
      const changePercent = (change / previousPrice) * 100;

      return {
        symbol,
        price: currentPrice,
        change,
        changePercent,
        currency: meta.currency || 'USD',
        timestamp: new Date().toISOString()
      };
    }

    throw new Error('Invalid response format');
  } catch (error) {
    console.error(`Error fetching ${symbol}:`, error.message);
    return null;
  }
}

app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const existing = userQueries.findByEmail(email.toLowerCase());
    if (existing) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = Date.now().toString(36) + Math.random().toString(36).substr(2);

    userQueries.create(userId, email.toLowerCase(), hashedPassword);

    req.session.userId = userId;
    req.session.email = email.toLowerCase();

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ success: true, userId, email: email.toLowerCase() });
  } catch (e) {
    console.error('Error registering:', e);
    res.status(500).json({ error: 'Failed to register' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const user = userQueries.findByEmail(email.toLowerCase());
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    req.session.userId = user.id;
    req.session.email = user.email;

    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    res.json({ success: true, userId: user.id, email: user.email });
  } catch (e) {
    console.error('Error logging in:', e);
    res.status(500).json({ error: 'Failed to login' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ error: 'Failed to logout' });
    }
    res.json({ success: true });
  });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  res.json({ userId: req.session.userId, email: req.session.email });
});

app.get('/api/sources', requireAuth, (req, res) => {
  try {
    const sources = sourceQueries.findByUser(req.session.userId);
    res.json(sources);
  } catch (e) {
    console.error('Error reading sources:', e);
    res.status(500).json({ error: 'Failed to read sources' });
  }
});

app.post('/api/sources', requireAuth, (req, res) => {
  try {
    const { name, url, type } = req.body;
    if (!name || !url || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    let parsedUrl;
    try {
      parsedUrl = new URL(url);
    } catch {
      return res.status(400).json({ error: 'Invalid URL format' });
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
      return res.status(400).json({ error: 'URL must use HTTP or HTTPS' });
    }

    const hostname = parsedUrl.hostname.toLowerCase();
    const privatePatterns = [
      /^localhost$/i,
      /^127\.\d+\.\d+\.\d+$/,
      /^::1$/,
      /^0\.\d+\.\d+\.\d+$/,
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /\.local$/i,
      /^localhost\.localdomain$/i
    ];

    if (privatePatterns.some(pattern => pattern.test(hostname))) {
      return res.status(400).json({ error: 'Private/local URLs are not allowed' });
    }

    const result = sourceQueries.create(req.session.userId, name, url, type, 1);
    res.json({ success: true, id: result.lastInsertRowid });
  } catch (e) {
    console.error('Error adding source:', e);
    res.status(500).json({ error: 'Failed to add source' });
  }
});

app.delete('/api/sources/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const result = sourceQueries.delete(id, req.session.userId);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Source not found' });
    }
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting source:', e);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

app.get('/api/feed', requireAuth, (req, res) => {
  try {
    const articles = articleQueries.findByUser(req.session.userId);
    res.json(articles);
  } catch (e) {
    console.error('Error reading articles:', e);
    res.status(500).json({ error: 'Failed to read articles' });
  }
});

const MAX_ARTICLES = 200;
let isRunning = false;

async function fetchArticles(userId) {
  if (isRunning) return { success: false, message: 'Fetch already in progress' };

  isRunning = true;
  console.log(`Starting manual fetch for user ${userId}...`);

  try {
    const sources = sourceQueries.findByUser(userId).filter(s => s.enabled);
    const existingArticles = articleQueries.findByUser(userId);
    const existingLinks = new Set(existingArticles.map(a => a.link));
    let newCount = 0;

    for (const src of sources) {
      try {
        console.log(`Fetching from ${src.name}...`);
        const items = await fetchSource(src);

        for (const it of items) {
          if (existingLinks.has(it.link)) continue;

          const summary = await summarizeArticle(it.content);
          articleQueries.create(userId, src.id, src.name, it.title, it.link, summary, it.published);
          existingLinks.add(it.link);
          newCount++;
        }
      } catch (e) {
        console.error(`Error processing ${src.name}:`, e.message);
      }
    }

    const countResult = articleQueries.countByUser(userId);
    if (countResult.count > MAX_ARTICLES) {
      const toDelete = countResult.count - MAX_ARTICLES;
      articleQueries.deleteOldest(userId, toDelete);
    }

    const totalResult = articleQueries.countByUser(userId);
    console.log(`Fetch complete. Total: ${totalResult.count}, New: ${newCount}`);
    return { success: true, message: `Fetched ${newCount} new articles. Total: ${totalResult.count}` };
  } catch (e) {
    console.error('Error in fetch:', e.message);
    return { success: false, message: e.message };
  } finally {
    isRunning = false;
  }
}

app.post('/api/fetch', requireAuth, async (req, res) => {
  const result = await fetchArticles(req.session.userId);
  res.json(result);
});

app.get('/api/stocks', async (req, res) => {
  try {
    const results = await Promise.all(STOCKS.map(fetchYahooFinance));
    let stocks = results.filter(s => s !== null);

    if (stocks.length === 0) {
      stocks = STOCKS.map(symbol => ({
        symbol,
        price: 0,
        change: 0,
        changePercent: 0,
        currency: 'USD',
        timestamp: new Date().toISOString(),
        error: 'API unavailable'
      }));
    }

    res.json(stocks);
  } catch (e) {
    console.error('Error fetching stocks:', e);
    res.status(500).json({ error: 'Failed to fetch stocks' });
  }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, 'public', 'index.html');
  res.sendFile(indexPath);
});

app.use((req, res) => {
  res.status(404).send('<h1>404 - Not Found</h1>');
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

const PORT = process.env.PORT || 3000;

async function startServer() {
  await initializeDatabase();
  console.log('Database initialized');
  
  const server = app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    saveDatabase();
    server.close(() => {
      console.log('Server closed');
      process.exit(0);
    });
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
