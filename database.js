const initSqlJs = require('sql.js');
const path = require('path');
const fs = require('fs');

const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const dbPath = path.join(dataDir, 'newsfeed.db');

let db;

async function initializeDatabase() {
  const SQL = await initSqlJs();
  
  let fileBuffer = null;
  if (fs.existsSync(dbPath)) {
    fileBuffer = fs.readFileSync(dbPath);
  }
  
  db = new SQL.Database(fileBuffer);

  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT DEFAULT 'rss',
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS articles (
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
  `);

  db.run(`CREATE INDEX IF NOT EXISTS idx_sources_user ON sources(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id);`);
  db.run(`CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(published_at);`);

  saveDatabase();
}

function saveDatabase() {
  const data = db.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

const userQueries = {
  create: (id, email, password) => {
    db.run('INSERT INTO users (id, email, password) VALUES (?, ?, ?)', [id, email, password]);
    saveDatabase();
  },
  findByEmail: (email) => {
    const stmt = db.prepare('SELECT * FROM users WHERE email = ?');
    stmt.bind([email]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },
  findById: (id) => {
    const stmt = db.prepare('SELECT id, email, created_at FROM users WHERE id = ?');
    stmt.bind([id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  }
};

const sourceQueries = {
  create: (user_id, name, url, type, enabled) => {
    db.run('INSERT INTO sources (user_id, name, url, type, enabled) VALUES (?, ?, ?, ?, ?)', [user_id, name, url, type, enabled]);
    saveDatabase();
    return { lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0].values[0][0] };
  },
  findByUser: (user_id) => {
    const results = [];
    const stmt = db.prepare('SELECT * FROM sources WHERE user_id = ? ORDER BY created_at DESC');
    stmt.bind([user_id]);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },
  findById: (id, user_id) => {
    const stmt = db.prepare('SELECT * FROM sources WHERE id = ? AND user_id = ?');
    stmt.bind([id, user_id]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },
  delete: (id, user_id) => {
    db.run('DELETE FROM sources WHERE id = ? AND user_id = ?', [id, user_id]);
    saveDatabase();
    return { changes: db.getRowsModified() };
  }
};

const articleQueries = {
  create: (user_id, source_id, source_name, title, link, summary, published_at) => {
    db.run(`
      INSERT INTO articles (user_id, source_id, source_name, title, link, summary, published_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [user_id, source_id, source_name, title, link, summary, published_at]);
    saveDatabase();
  },
  findByUser: (user_id) => {
    const results = [];
    const stmt = db.prepare('SELECT * FROM articles WHERE user_id = ? ORDER BY published_at DESC');
    stmt.bind([user_id]);
    while (stmt.step()) {
      results.push(stmt.getAsObject());
    }
    stmt.free();
    return results;
  },
  findByLink: (link) => {
    const stmt = db.prepare('SELECT * FROM articles WHERE link = ?');
    stmt.bind([link]);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return null;
  },
  deleteOldest: (user_id, count) => {
    db.run(`
      DELETE FROM articles WHERE id IN (
        SELECT id FROM articles WHERE user_id = ? 
        ORDER BY fetched_at ASC LIMIT ?
      )
    `, [user_id, count]);
    saveDatabase();
  },
  countByUser: (user_id) => {
    const stmt = db.prepare('SELECT COUNT(*) as count FROM articles WHERE user_id = ?');
    stmt.bind([user_id]);
    stmt.step();
    const result = stmt.getAsObject();
    stmt.free();
    return result;
  }
};

module.exports = { 
  initializeDatabase, 
  saveDatabase,
  getDb: () => db,
  userQueries, 
  sourceQueries, 
  articleQueries 
};
