import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || '';

app.use(cors());
app.use(express.json());

// Track connection state
let isMongoConnected = false;
let mongoError = null;

// Connect to MongoDB Atlas
async function connectDB() {
  if (!MONGODB_URI || MONGODB_URI.includes('<db_username>')) {
    console.warn('\n⚠️ [MongoDB] <db_username> placeholder detected in MONGODB_URI.');
    console.warn('⚠️ Please update .env with your actual MongoDB Atlas database username to enable cloud sync.\n');
    mongoError = 'Username placeholder <db_username> must be replaced in .env';
    return;
  }

  try {
    console.log('[MongoDB] Connecting to MongoDB Atlas...');
    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 7000
    });
    isMongoConnected = true;
    mongoError = null;
    console.log('✅ [MongoDB Atlas] Connected successfully to cloud database!');
  } catch (err) {
    isMongoConnected = false;
    mongoError = err.message;
    console.error('❌ [MongoDB Atlas] Connection failed:', err.message);
  }
}

connectDB();

// Mongoose Schema & Model
const videoSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true, index: true },
  name: { type: String, default: '' },
  date: { type: String, required: true },
  edit: { type: Boolean, default: true },
  sent: { type: Boolean, default: false },
  yt: { type: Boolean, default: false },
  ig: { type: Boolean, default: false },
  createdAt: { type: String, default: () => new Date().toISOString() }
}, {
  timestamps: true,
  toJSON: {
    transform: (doc, ret) => {
      delete ret._id;
      delete ret.__v;
      return ret;
    }
  }
});

const Video = mongoose.models.Video || mongoose.model('Video', videoSchema);

// Middleware to check DB connection
const requireDB = (req, res, next) => {
  if (!isMongoConnected) {
    return res.status(503).json({
      error: 'MongoDB Atlas is not connected yet.',
      details: mongoError,
      isConfigured: !MONGODB_URI.includes('<db_username>')
    });
  }
  next();
};

// ==========================================
// REST API ROUTES
// ==========================================

// Health & Connection Status
app.get('/api/status', (req, res) => {
  res.json({
    connected: isMongoConnected,
    database: isMongoConnected ? 'MongoDB Atlas' : 'Local Fallback',
    error: mongoError,
    needsUsername: MONGODB_URI.includes('<db_username>')
  });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({ status: 'ok', mongo: isMongoConnected });
});

// GET all videos
app.get('/api/videos', requireDB, async (req, res) => {
  try {
    const videos = await Video.find({}).sort({ date: -1, createdAt: -1 });
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch videos from MongoDB', details: err.message });
  }
});

// POST new video
app.post('/api/videos', requireDB, async (req, res) => {
  try {
    const { id, name, date, edit, sent, yt, ig, createdAt } = req.body;
    const newVideo = new Video({
      id: id || ('r_' + Date.now() + '_' + Math.floor(Math.random() * 1000)),
      name: name || '',
      date: date || new Date().toISOString().split('T')[0],
      edit: edit !== undefined ? edit : true,
      sent: sent !== undefined ? sent : false,
      yt: yt !== undefined ? yt : false,
      ig: ig !== undefined ? ig : false,
      createdAt: createdAt || new Date().toISOString()
    });

    await newVideo.save();
    res.status(201).json(newVideo);
  } catch (err) {
    res.status(500).json({ error: 'Failed to save video to MongoDB', details: err.message });
  }
});

// PUT update video
app.put('/api/videos/:id', requireDB, async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const updated = await Video.findOneAndUpdate(
      { id },
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Video row not found' });
    }

    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Failed to update video in MongoDB', details: err.message });
  }
});

// DELETE video
app.delete('/api/videos/:id', requireDB, async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await Video.findOneAndDelete({ id });
    if (!deleted) {
      return res.status(404).json({ error: 'Video row not found' });
    }
    res.json({ message: 'Deleted successfully', id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete video in MongoDB', details: err.message });
  }
});

// Bulk Delete
app.post('/api/videos/bulk-delete', requireDB, async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'No IDs provided' });
    }
    await Video.deleteMany({ id: { $in: ids } });
    res.json({ message: `Deleted ${ids.length} rows` });
  } catch (err) {
    res.status(500).json({ error: 'Bulk delete failed', details: err.message });
  }
});

// Bulk Update
app.post('/api/videos/bulk-update', requireDB, async (req, res) => {
  try {
    const { ids, updates } = req.body;
    if (!Array.isArray(ids) || !ids.length) {
      return res.status(400).json({ error: 'No IDs provided' });
    }
    await Video.updateMany({ id: { $in: ids } }, { $set: updates });
    res.json({ message: `Updated ${ids.length} rows` });
  } catch (err) {
    res.status(500).json({ error: 'Bulk update failed', details: err.message });
  }
});

// Sync localStorage items into MongoDB
app.post('/api/videos/sync', requireDB, async (req, res) => {
  try {
    const { items } = req.body;
    if (!Array.isArray(items)) {
      return res.status(400).json({ error: 'Invalid payload' });
    }

    for (const it of items) {
      await Video.findOneAndUpdate(
        { id: it.id },
        { $set: it },
        { upsert: true, new: true }
      );
    }

    const allVideos = await Video.find({}).sort({ date: -1, createdAt: -1 });
    res.json({ message: `Synced ${items.length} items`, videos: allVideos });
  } catch (err) {
    res.status(500).json({ error: 'Sync failed', details: err.message });
  }
});

// Serve frontend static assets
const distDir = path.join(__dirname, 'dist');
const serveDir = fs.existsSync(distDir) ? distDir : __dirname;

app.use(express.static(serveDir, { maxAge: '1h', etag: true }));

app.get('*', (req, res) => {
  const indexPath = path.join(serveDir, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Please run npm run build first.');
  }
});

app.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`🎬 Daily Video Tracker (Excel Edition + MongoDB Atlas)`);
  console.log(`🌐 Server running at: http://localhost:${PORT}`);
  console.log(`📡 MongoDB Status:   ${isMongoConnected ? '🟢 Connected' : '⚪ Waiting for Atlas credentials'}`);
  console.log(`======================================================\n`);
});
