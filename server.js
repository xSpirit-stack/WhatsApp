// server.js
// WhatsApp Decrypt API with save + direct download link + auto-delete
// ---------------------------------------------------------------

const express = require('express');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

// Try to import the project's decoder. It should export a function that returns a Buffer.
//   module.exports = async function decodeWhatsAppMedia({ url, mediaKey, messageType, mimetype }) { ... }
// If your export is different, adjust the require line below.
let decodeWhatsAppMedia;
try {
  const mod = require('./decode');
  decodeWhatsAppMedia = mod.decodeWhatsAppMedia || mod.default || mod;
} catch (e) {
  console.error('Failed to load ./decode:', e);
  process.exit(1);
}

const app = express();
app.use(express.json({ limit: '5mb' }));

// -------- Environment --------
const PORT = Number(process.env.PORT || 8889);
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(process.cwd(), 'downloads');
// Delete file right after a successful one-time download link
const ONE_TIME_DOWNLOAD = String(process.env.ONE_TIME_DOWNLOAD || 'true').toLowerCase() === 'true';
// Periodic cleanup of files older than RETENTION_HOURS (0 to disable)
const RETENTION_HOURS = Number(process.env.RETENTION_HOURS || 24);

// Ensure download directory exists
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

// Serve static downloads (persistent links)
app.use('/downloads', express.static(DOWNLOAD_DIR, {
  maxAge: '7d',
  setHeaders: (res) => {
    res.setHeader('Content-Disposition', 'attachment');
  }
}));

// Healthcheck
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Map mime to file extension
function extFromMime(mimetype = '') {
  const m = String(mimetype || '').toLowerCase();
  if (m.includes('audio/ogg')) return '.ogg';
  if (m.includes('audio/mpeg') || m.includes('audio/mp3')) return '.mp3';
  if (m.includes('audio/mp4') || m.includes('audio/aac')) return '.m4a';
  if (m.includes('video/mp4')) return '.mp4';
  if (m.includes('image/jpeg')) return '.jpg';
  if (m.includes('image/png')) return '.png';
  if (m.includes('application/pdf')) return '.pdf';
  return '.bin';
}

// POST /decode: decode media, save to disk, return link(s)
app.post('/decode', async (req, res) => {
  try {
    const {
      url,
      mediaKey,
      messageType, // e.g. 'audioMessage'
      mimetype,    // e.g. 'audio/ogg; codecs=opus'
      // other fields are accepted and may be used by the decoder
    } = req.body || {};

    if (!url || !mediaKey) {
      return res.status(400).json({ error: 'url and mediaKey are required' });
    }

    const buffer = await decodeWhatsAppMedia({ url, mediaKey, messageType, mimetype });

    if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
      return res.status(500).json({ error: 'decode_failed', details: 'Empty buffer returned from decoder' });
    }

    const ext = extFromMime(mimetype);
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(DOWNLOAD_DIR, filename);

    await fs.promises.writeFile(filePath, buffer);

    const oneTimeUrl = `${BASE_URL}/download/${filename}`;
    const staticUrl  = `${BASE_URL}/downloads/${filename}`;

    return res.status(200).json({
      status: 'ok',
      downloadUrl: ONE_TIME_DOWNLOAD ? oneTimeUrl : staticUrl,
      staticUrl,
      filename,
      size: buffer.length
    });
  } catch (err) {
    console.error('[decode] error:', err);
    return res.status(500).json({
      error: 'failed_to_decode',
      details: String(err?.message || err)
    });
  }
});

// GET /download/:filename: send file and (optionally) delete after download
app.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes('/') || filename.includes('..')) {
      return res.status(400).send('Invalid filename');
    }
    const filePath = path.join(DOWNLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).send('Not found');
    }

    res.download(filePath, filename, async (err) => {
      if (err) {
        console.error('[download] send error:', err);
        return;
      }
      if (ONE_TIME_DOWNLOAD) {
        try {
          await fs.promises.unlink(filePath);
          console.log('[download] deleted after one-time:', filename);
        } catch (e) {
          console.error('[download] delete error:', e);
        }
      }
    });
  } catch (err) {
    console.error('[download] error:', err);
    return res.status(500).send('Internal error');
  }
});

// DELETE /downloads/:filename: manual delete
app.delete('/downloads/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes('/') || filename.includes('..')) {
      return res.status(400).json({ error: 'invalid_filename' });
    }
    const filePath = path.join(DOWNLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'not_found' });
    }
    await fs.promises.unlink(filePath);
    return res.json({ status: 'deleted', filename });
  } catch (err) {
    console.error('[delete] error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// Periodic retention cleanup
if (RETENTION_HOURS > 0) {
  const intervalMs = 30 * 60 * 1000; // every 30 minutes
  setInterval(async () => {
    try {
      const now = Date.now();
      const files = await fs.promises.readdir(DOWNLOAD_DIR);
      await Promise.all(files.map(async (f) => {
        try {
          const full = path.join(DOWNLOAD_DIR, f);
          const st = await fs.promises.stat(full);
          const ageMs = now - st.mtimeMs;
          if (ageMs > RETENTION_HOURS * 3600 * 1000) {
            await fs.promises.unlink(full);
            console.log('[retention] deleted stale file:', f);
          }
        } catch (_) {}
      }));
    } catch (e) {
      console.error('[retention] error:', e);
    }
  }, intervalMs);
}

// Start server
app.listen(PORT, () => {
  console.log(`WhatsApp Decrypt API running on port ${PORT}`);
  console.log(`Health: ${BASE_URL}/health`);
  console.log(`Static downloads: ${BASE_URL}/downloads/<filename>`);
});
