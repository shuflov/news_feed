// src/server.js
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const fetcher = require('./utils/fetcher');
const ai = require('./utils/ai');

const app = express();

// Manual CORS headers instead of cors middleware
// Replace the current CORS middleware with this:
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = [
    'https://shuflov.github.io',
    'https://stealthier-amirah-duteously.ngrok-free.dev'
  ];
  
  // Set CORS for all responses
  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  } else {
    // Also allow the ngrok URL if origin is not set (like from ngrok warning page)
    res.setHeader('Access-Control-Allow-Origin', 'https://shuflov.github.io');
  }
  
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, ngrok-skip-browser-warning, Authorization');
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
  store: new session.MemoryStore(),
  cookie: { 
    secure: true,
    httpOnly: true,
    sameSite: 'none',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    domain: undefined // Let browser set it automatically
  }
}));

// Define paths
const dataDir = path.join(__dirname, '../data');
const usersPath = path.join(dataDir, 'users.json');

// ---------- Initialize data files ----------
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(usersPath)) {
  fs.writeFileSync(usersPath, '[]');
}

// Helper: get user data path
function getUserDataPath(userId) {
  const userDir = path.join(dataDir, 'users', userId.toString());
  if (!fs.existsSync(userDir)) {
    fs.mkdirSync(userDir, { recursive: true });
  }
  return {
    dir: userDir,
    sources: path.join(userDir, 'sources.json'),
    articles: path.join(userDir, 'articles.json')
  };
}

// Initialize user files if they don't exist
function initUserFiles(userId) {
  const userPaths = getUserDataPath(userId);
  if (!fs.existsSync(userPaths.sources)) {
    fs.writeFileSync(userPaths.sources, '[]');
  }
  if (!fs.existsSync(userPaths.articles)) {
    fs.writeFileSync(userPaths.articles, '[]');
  }
}

// Middleware: require auth
function requireAuth(req, res, next) {
  if (!req.session.userId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  next();
}

// ---------- Auth ----------
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      return res.status(400).json({ error: 'Email already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = Date.now().toString(36) + Math.random().toString(36).substr(2);
    
    const newUser = {
      id: userId,
      email: email.toLowerCase(),
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };
    
    users.push(newUser);
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2));
    
    initUserFiles(userId);
    
    req.session.userId = userId;
    req.session.email = newUser.email;
    
    req.session.save((err) => {
      if (err) {
        console.error('Session save error:', err);
      }
    });
    
    res.json({ success: true, userId, email: newUser.email });
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

    const users = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    const user = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    initUserFiles(user.id);
    
    req.session.userId = user.id;
    req.session.email = user.email;
    
    console.log('Login - Session ID:', req.session.id);
    console.log('Login - Session cookie:', req.session.cookie);
    
    // Wait for session to be saved before responding
    await new Promise((resolve, reject) => {
      req.session.save((err) => {
        if (err) {
          console.error('Session save error:', err);
          reject(err);
        } else {
          console.log('Session saved successfully');
          resolve();
        }
      });
    });
    
    console.log('Sending response to client');
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

// ---------- API ----------
app.get('/api/sources', requireAuth, (req, res) => {
  try {
    const userPaths = getUserDataPath(req.session.userId);
    const src = JSON.parse(fs.readFileSync(userPaths.sources, 'utf8'));
    res.json(src);
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
      /^localhost\.localdomain$/i,
    ];

    if (privatePatterns.some(pattern => pattern.test(hostname))) {
      return res.status(400).json({ error: 'Private/local URLs are not allowed' });
    }

    const userPaths = getUserDataPath(req.session.userId);
    const sources = JSON.parse(fs.readFileSync(userPaths.sources, 'utf8'));
    const id = Date.now();
    sources.push({ id, name, url, type, enabled: true });
    fs.writeFileSync(userPaths.sources, JSON.stringify(sources, null, 2));
    res.json({ success: true, id });
  } catch (e) {
    console.error('Error adding source:', e);
    res.status(500).json({ error: 'Failed to add source' });
  }
});

app.delete('/api/sources/:id', requireAuth, (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const userPaths = getUserDataPath(req.session.userId);
    let sources = JSON.parse(fs.readFileSync(userPaths.sources, 'utf8'));
    sources = sources.filter(s => s.id !== id);
    fs.writeFileSync(userPaths.sources, JSON.stringify(sources, null, 2));
    res.json({ success: true });
  } catch (e) {
    console.error('Error deleting source:', e);
    res.status(500).json({ error: 'Failed to delete source' });
  }
});

app.get('/api/feed', requireAuth, (req, res) => {
  try {
    const userPaths = getUserDataPath(req.session.userId);
    const articles = JSON.parse(fs.readFileSync(userPaths.articles, 'utf8'));
    articles.sort((a, b) => new Date(b.published_at) - new Date(a.published_at));
    res.json(articles);
  } catch (e) {
    console.error('Error reading articles:', e);
    res.status(500).json({ error: 'Failed to read articles' });
  }
});

// ---------- Stocks ----------
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

app.get('/api/stock/:symbol', async (req, res) => {
  try {
    const stock = await fetchYahooFinance(req.params.symbol);
    if (!stock) return res.status(404).json({ error: 'Symbol not found' });
    res.json(stock);
  } catch (e) {
    console.error('Error fetching stock:', e);
    res.status(500).json({ error: 'Failed to fetch stock' });
  }
});

// ---------- Manual Fetch ----------
let isRunning = false;
const MAX_ARTICLES = 200;

async function fetchArticles(userId) {
  if (isRunning) return { success: false, message: 'Fetch already in progress' };
  
  isRunning = true;
  console.log(`Starting manual fetch for user ${userId}...`);
  
  try {
    const userPaths = getUserDataPath(userId);
    const sources = JSON.parse(fs.readFileSync(userPaths.sources, 'utf8'));
    let articles = JSON.parse(fs.readFileSync(userPaths.articles, 'utf8'));
    let newCount = 0;

    for (const src of sources.filter(s => s.enabled)) {
      try {
        console.log(`Fetching from ${src.name}...`);
        const items = await fetcher.fetchSource(src);
        
        for (const it of items) {
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
          newCount++;
        }
      } catch (e) {
        console.error(`Error processing ${src.name}:`, e.message);
      }
    }

    if (articles.length > MAX_ARTICLES) {
      articles = articles
        .sort((a, b) => new Date(b.fetched_at) - new Date(a.fetched_at))
        .slice(0, MAX_ARTICLES);
    }

    fs.writeFileSync(userPaths.articles, JSON.stringify(articles, null, 2));
    console.log(`Fetch complete. Total: ${articles.length}, New: ${newCount}`);
    return { success: true, message: `Fetched ${newCount} new articles. Total: ${articles.length}` };
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

// ---------- Serve Frontend ----------
app.use(express.static(path.join(__dirname, '../public')));

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '../public/index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('<h1>404 - Not Found</h1>');
  }
});

app.use((req, res) => {
  res.status(404).send('<h1>404 - Not Found</h1>');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
