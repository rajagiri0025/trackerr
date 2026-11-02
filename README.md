# 🎬 Daily Video Tracker Pro

> A modern, ultra-responsive content production & publishing workflow tracker designed specifically for both **mobile screens** (touch cards, large tap targets, floating action button, swipeable filters) and **laptop/desktop screens** (dense table view, analytics KPI cards, keyboard shortcuts, multi-select bulk operations).

---

## 🌟 Key Features

### 📱 Mobile-First Ergonomics
- **Touch-Optimized Cards**: Replaces cramped spreadsheets with clear visual cards formatted for one-thumb mobile browsing.
- **Large Pipeline Stage Buttons**: Easily toggle `✏️ To Edit`, `📤 Sent for Review`, `🔴 YouTube`, and `📸 Instagram` with generous 44px+ tap targets.
- **Sticky Frosted Header**: Safe-area inset support for modern smartphone notches (iOS & Android).
- **Floating Action Button (FAB)**: Quick `+ Add Video` drawer accessible right at your fingertips.
- **Swipeable Filter Pills**: Scroll smoothly between "All", "Needs Edit", "Sent", "YouTube", "Instagram", and "Completed".
- **Undo Delete Toast**: 5-second undo toast notification prevents accidental data loss without annoying browser popups.

### 💻 Laptop & Desktop Power Features
- **Dual View Modes**: Switch seamlessly between **Card Grid View** (spacious & visual) and **Table View** (compact, spreadsheet-style with badges).
- **Interactive KPI Metric Cards**: Live counters for Total, In Editing, Sent, YouTube, Instagram, and Overall Completion Rate. Click any card to instantly filter the list!
- **Multi-Select & Bulk Operations**: Check multiple videos to batch mark as Sent, YouTube, Instagram, or Delete.
- **Fast Keyboard Shortcuts**:
  - `N` → Add new video
  - `/` → Focus instant search
  - `V` → Toggle between Cards and Table view
  - `Esc` → Close any open modal / menu
- **Export & Import**: One-click **CSV Export** (compatible with Excel, Notion, Google Sheets) and **JSON Backups**.
- **Dark & Light Mode**: Curated color palette with smooth transitions and system preference auto-detection.
- **Zero Data Loss**: 100% backward compatible with existing `videoTracker.v1` localStorage data.

---

## 🚀 Quick Start (Local Development)

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Development Server
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser.

### 3. Build for Production
```bash
npm run build
```
Creates an optimized production bundle in the `dist/` directory.

### 4. Run Production Node Server
```bash
npm start
```
Starts the production Express server at [http://localhost:3000](http://localhost:3000) with healthcheck endpoint at `/healthz`.

---

## ☁️ 1-Minute Deployment Guide

This project is pre-configured and ready to deploy to any major cloud platform:

### Option 1: Vercel (Recommended)
1. Push this repository to GitHub or GitLab.
2. Go to [vercel.com/new](https://vercel.com/new).
3. Import your repository. Vercel automatically detects the Vite framework and `vercel.json`.
4. Click **Deploy**. Your app will be live with a global CDN!

### Option 2: Netlify
1. Go to [netlify.com](https://netlify.com) and click **Add new site > Import an existing project**.
2. Select your repository. Netlify will automatically detect `netlify.toml`.
3. Click **Deploy Site**.

### Option 3: GitHub Pages (Automated CI/CD)
1. Push your repository to GitHub.
2. In your repository, go to **Settings > Pages**.
3. Under **Build and deployment > Source**, select **GitHub Actions**.
4. The included workflow [deploy.yml](.github/workflows/deploy.yml) will automatically build and publish the site on every push to `main`!

### Option 4: Render / Railway / Fly.io (Node Web Service)
1. Connect your repository to [Render.com](https://render.com) or [Railway.app](https://railway.app).
2. Choose **Web Service**.
3. Set:
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
4. Deploy! The included Express server (`server.js`) includes a `/healthz` endpoint for automated zero-downtime health monitoring.

### Option 5: Docker Container
Build and run the containerized app with Docker:
```bash
docker build -t daily-video-tracker .
docker run -p 3000:3000 daily-video-tracker
```

---

## 📁 Project Structure

```
├── .github/workflows/
│   └── deploy.yml          # Automated GitHub Pages CI/CD
├── public/
│   ├── favicon.svg         # SVG Clapperboard favicon
│   └── manifest.json       # PWA manifest
├── src/
│   ├── main.js             # State management, pipeline logic, export & undo
│   └── style.css           # Vanilla CSS responsive design system (light/dark)
├── dist/                   # Production distribution build
├── server.js               # Node.js Express server for PaaS/Docker
├── index.html              # Main HTML application entry point
├── Daily Video Tracker.html# Standalone, single-file offline portable version
├── package.json            # Node & script configurations
├── vercel.json             # Vercel deployment configuration
├── netlify.toml            # Netlify deployment configuration
├── Dockerfile              # Production Docker multi-stage build
└── README.md               # Documentation & deployment instructions
```

---

## 📄 License
MIT — Free for personal and commercial content production.
