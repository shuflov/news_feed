# News Feed Aggregator

A simple Node.js-based RSS feed aggregator with a clean web interface. Fetches articles from multiple RSS sources, summarizes them, and displays them in a randomized feed.

## Features

- **RSS Feed Aggregation**: Automatically fetches articles from multiple RSS sources
- **Automated Fetching**: Background cron job runs every 10 minutes to check for new articles
- **Randomized Feed**: Articles are displayed in random order (not grouped by source)
- **Source Management**: Add, view, and delete RSS sources through the web interface
- **Article Summaries**: Automatic content summarization (placeholder implementation)
- **Dark Mode**: Toggle between light and dark themes
- **Auto-refresh**: Feed automatically refreshes every minute
- **Manual Refresh**: Refresh button to manually update the feed

## Tech Stack

- **Backend**: Node.js, Express
- **Scheduler**: node-cron
- **RSS Parsing**: rss-parser
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **Data Storage**: JSON files (sources.json, articles.json)

## Installation

1. Clone or download the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Usage

1. Start the server:
   ```bash
   npm start
   # or
   node src/server.js
   ```

2. Open your browser and go to:
   ```
   http://localhost:3000
   ```

3. Add RSS sources using the "Manage Sources" button

4. Wait for the cron job to fetch articles (runs every 10 minutes), or refresh the page

## Project Structure

```
news_feed/
├── src/
│   ├── server.js          # Express server and API endpoints
│   ├── utils/
│   │   ├── fetcher.js     # RSS feed fetching logic
│   │   └── ai.js          # Article summarization
│   └── data/
│       ├── sources.json   # RSS source configuration
│       └── articles.json  # Stored articles
├── public/
│   ├── index.html         # Frontend interface
│   └── style.css          # Styling
├── package.json
└── README.md
```

## API Endpoints

- `GET /api/sources` - Get all RSS sources
- `POST /api/sources` - Add a new RSS source
- `DELETE /api/sources/:id` - Delete a source
- `GET /api/feed` - Get all articles (sorted by date)

## Configuration

- **Fetch Interval**: 10 minutes (configurable in `server.js` line 75)
- **Max Articles**: 200 (configurable in `server.js` line 73)
- **Auto-refresh**: 60 seconds (configurable in `index.html`)
- **Port**: 3000 (or `process.env.PORT`)

## Data Storage

Data is stored in JSON files in the `src/data/` directory:
- `sources.json`: Array of RSS source objects
- `articles.json`: Array of article objects

## To-Do

- [ ] Integrate real AI summarization (OpenAI, etc.)
- [ ] Add JSON/HTML feed support
- [ ] Add article categories/tags
- [ ] Implement article search/filter
- [ ] Add export functionality (OPML, etc.)

## License

ISC
