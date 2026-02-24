News Feed Aggregator - Rewrite Prompt
Rewrite my Node.js news feed aggregator application to use SQLite instead of JSON files and simplify deployment. Keep user separation - each user should have their own sources and articles.

Current Stack (to be replaced)
Express.js server with JSON file storage
express-session for auth
ngrok tunnel for public access
Separate gh-pages branch for frontend
Complex CORS setup for cross-origin requests
Data stored in data/users.json and data/users/{userId}/sources.json, data/users/{userId}/articles.json
New Requirements
Database Schema
Replace all JSON file storage with SQLite using better-sqlite3. Create these tables:

sql

-- Users table
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now'))
);

-- Sources table (each user has their own sources)
CREATE TABLE sources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT DEFAULT 'rss',
  enabled INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Articles table (each user has their own articles)
CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  source_id INTEGER,
  source_name TEXT,
  title TEXT NOT NULL,
  link TEXT UNIQUE NOT NULL,
  summary TEXT,
  published_at TEXT,
  fetched_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (source_id) REFERENCES sources(id) ON DELETE SET NULL
);

-- Sessions table for express-session
CREATE TABLE sessions (
  sid TEXT PRIMARY KEY,
  sess TEXT NOT NULL,
  expired TEXT NOT NULL
);

-- Indexes for performance
CREATE INDEX idx_sources_user ON sources(user_id);
CREATE INDEX idx_articles_user ON articles(user_id);
CREATE INDEX idx_articles_date ON articles(published_at);
CREATE INDEX idx_sessions_expired ON sessions(expired);
Simplified Architecture
Single deployment target (Render.com free tier compatible)
Frontend and backend served from same Express server
No CORS issues (same origin)
No ngrok needed
Environment variable for PORT
Authentication
Keep user registration and login
Keep express-session with SQLite session store (use connect-better-sqlite3 or similar)
Simplified cookie settings for same-origin deployment
Sessions table in same database
Password hashing with bcryptjs
Frontend
Serve static files from ./public folder via Express
Single HTML file with embedded CSS and JS
API calls use relative paths (no API_BASE variable needed)
Remove all ngrok-related code and headers
Keep all existing UI features:
Login/Register screens
Dark mode toggle
Source management panel
Stock ticker display
Article feed with randomization
API Endpoints (keep same behavior)
Method
Endpoint
Description
POST	/api/auth/register	Create new user account
POST	/api/auth/login	Authenticate user, create session
POST	/api/auth/logout	Destroy session
GET	/api/auth/me	Get current user info
GET	/api/sources	Get current user's sources
POST	/api/sources	Add new source for current user
DELETE	/api/sources/:id	Delete source (only if owned by user)
GET	/api/feed	Get current user's articles
POST	/api/fetch	Fetch new articles for current user
GET	/api/stocks	Get stock prices (public, no auth)

Project Structure
text

news_feed/
├── server.js           # Main Express server
├── database.js         # SQLite setup and queries
├── package.json
├── .env.example
├── .gitignore
├── data/               # Created automatically
│   └── newsfeed.db     # SQLite database file
└── public/
    └── index.html      # Single frontend file
package.json
json

{
  "name": "news_feed",
  "version": "2.0.0",
  "description": "RSS Feed Aggregator with SQLite",
  "main": "server.js",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "bcryptjs": "^2.4.3",
    "connect-better-sqlite3": "^1.1.0",
    "dotenv": "^16.0.0",
    "express": "^4.21.0",
    "express-session": "^1.18.0",
    "node-cron": "^4.0.0",
    "rss-parser": "^3.13.0"
  }
}
Environment Variables
env

# .env.example
PORT=3000
SESSION_SECRET=your-secret-key-change-in-production
NODE_ENV=production
Deployment Ready
Add proper error handling with try/catch in all routes
Add simple rate limiting (optional, in-memory is fine)
Graceful shutdown handling
Health check endpoint: GET /health returns { "status": "ok" }
Database file created automatically on first run
All tables created automatically on startup
User Separation - Important
Every API endpoint that accesses sources or articles MUST filter by user_id
Users can only see/edit their own sources
Users can only see their own articles
When fetching articles, only fetch from the current user's enabled sources
Max 200 articles per user (prune oldest when exceeded)
Keep These Features
RSS Feed Fetching - Using rss-parser, fetch from all enabled sources
Article Summarization - Keep placeholder function (returns first 150 chars)
Stock Price Display - Keep Yahoo Finance API calls (TSLA, BTC-USD, TOY.TO, ^GSPC)
Dark Mode Toggle - CSS and localStorage based
Responsive Design - Mobile-friendly grid layout
Source Management UI - Add, view, delete sources
Auto-refresh - Stocks refresh every 5 minutes
Manual Fetch - "Refresh Feed" button to fetch new articles
Security
Input validation on all endpoints
Password hashing with bcryptjs (10 rounds)
Session cookie: httpOnly, secure in production, sameSite: 'lax'
URL validation for sources (no private/local URLs)
SQL injection protection via prepared statements
Error Handling
All API errors return JSON: { "error": "message" }
Frontend shows error messages to user
Server logs errors to console
401 for auth errors, 400 for validation, 500 for server errors
Deliverables
Please provide these complete files:

package.json - Dependencies and scripts
server.js - Main Express server with all routes
database.js - SQLite setup, table creation, query functions
public/index.html - Complete frontend (HTML + CSS + JS)
.env.example - Environment variable template
.gitignore - Standard Node.js gitignore
Notes
Do NOT use TypeScript, keep plain JavaScript
Do NOT use any frontend frameworks, keep vanilla JS
Do NOT add any additional dependencies beyond what's listed
The code should run with just npm install && npm start
Target Render.com free tier (Node.js environment)