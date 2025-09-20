// server.js
const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { randomUUID } = require('crypto');

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
app.use(express.urlencoded({ extended: true }));
const upload = multer();

const PORT = Number(process.env.PORT || 8889);
const DOWNLOAD_DIR = process.env.DOWNLOAD_DIR || path.join(process.cwd(), 'downloads');
const ONE_TIME_DOWNLOAD = String(process.env.ONE_TIME_DOWNLOAD || 'true').toLowerCase() === 'true';
const RETENTION_HOURS = Number(process.env.RETENTION_HOURS || 24);

fs.mkdirSync(DOWNLOAD_DIR, { recursive: true });

app.use('/downloads', express.static(DOWNLOAD_DIR, {
  maxAge: '7d',
  setHeaders: (res) => res.setHeader('Content-Disposition', 'attachment')
}));

app.get('/health', (_req, res) => res.json({ status: 'ok' }));

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

// Robust handler for n8n (JSON/form-data/urlencoded/raw)
app.post('/decode', upload.none(), async (req, res) => {
  try {
    // Normalize body
    let body = req.body;
    if (typeof body === 'string') {
      try { body = JSON.parse(body); } catch (_) { body = {}; }
    }
    if (!body || (typeof body === 'object' && Object.keys(body).length === 0)) {
      const candidate = req.body?.json || req.body?.data || req.body?.payload || req.body?.body;
      if (candidate && typeof candidate === 'string') {
        try { body = JSON.parse(candidate); } catch (_) { body = candidate; }
      } else if (candidate && typeof candidate === 'object') {
        body = candidate;
      }
    }
    if ((!body || !Object.keys(body).length) && Object.keys(req.query || {}).length) {
      body = Object.fromEntries(Object.entries(req.query).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]));
    }
    if (!body || typeof body !== 'object') body = {};

    const { url, mediaKey, messageType, mimetype, whatsappTypeMessageToDecode } = body;

    // Fallback for whatsappTypeMessageToDecode
    let _whatsType = whatsappTypeMessageToDecode;
    if (!_whatsType && messageType) {
      const mt = String(messageType).toLowerCase();
      if (mt.includes('audio')) _whatsType = 'WhatsApp Audio Keys';
      else if (mt.includes('image')) _whatsType = 'WhatsApp Image Keys';
      else if (mt.includes('video')) _whatsType = 'WhatsApp Video Keys';
      else if (mt.includes('sticker')) _whatsType = 'WhatsApp Image Keys';
      else _whatsType = 'WhatsApp Audio Keys';
    }

    if (!url || !mediaKey) {
      return res.status(400).json({ error: 'url and mediaKey are required' });
    }

    // Decode with base64 output
    const decodedBase64 = await decodeWhatsAppMedia(
      { url, mediaKey, messageType, mimetype, whatsappTypeMessageToDecode: _whatsType },
      'base64'
    );

    let buffer;
    if (typeof decodedBase64 === 'string') {
      if (decodedBase64.startsWith('File saved as:')) {
        buffer = Buffer.alloc(0);
      } else {
        buffer = Buffer.from(decodedBase64, 'base64');
      }
    } else if (Buffer.isBuffer(decodedBase64)) {
      buffer = decodedBase64;
    } else {
      buffer = Buffer.alloc(0);
    }

    if (!buffer || !buffer.length) {
      return res.status(500).json({ error: 'decode_failed', details: 'Empty buffer returned from decoder' });
    }

    // Save and return relative links
    const ext = extFromMime(mimetype);
    const filename = `${randomUUID()}${ext}`;
    const filePath = path.join(DOWNLOAD_DIR, filename);
    await fs.promises.writeFile(filePath, buffer);

    const oneTimeUrl = `/download/${filename}`;
    const staticUrl  = `/downloads/${filename}`;

    return res.status(200).json({
      status: 'ok',
      downloadUrl: ONE_TIME_DOWNLOAD ? oneTimeUrl : staticUrl,
      staticUrl,
      filename,
      size: buffer.length
    });

  } catch (err) {
    console.error('[decode] error:', err);
    return res.status(500).json({ error: 'failed_to_decode', details: String(err?.message || err) });
  }
});

// One-time download (delete after send if enabled)
app.get('/download/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes('/') || filename.includes('..')) return res.status(400).send('Invalid filename');
    const filePath = path.join(DOWNLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).send('Not found');

    res.download(filePath, filename, async (err) => {
      if (err) { console.error('[download] send error:', err); return; }
      if (ONE_TIME_DOWNLOAD) {
        try { await fs.promises.unlink(filePath); console.log('[download] deleted after one-time:', filename); }
        catch (e) { console.error('[download] delete error:', e); }
      }
    });
  } catch (err) {
    console.error('[download] error:', err);
    return res.status(500).send('Internal error');
  }
});

// Manual delete
app.delete('/downloads/:filename', async (req, res) => {
  try {
    const { filename } = req.params;
    if (!filename || filename.includes('/') || filename.includes('..')) return res.status(400).json({ error: 'invalid_filename' });
    const filePath = path.join(DOWNLOAD_DIR, filename);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'not_found' });
    await fs.promises.unlink(filePath);
    return res.json({ status: 'deleted', filename });
  } catch (err) {
    console.error('[delete] error:', err);
    return res.status(500).json({ error: 'internal_error' });
  }
});

// TTL cleanup
if (RETENTION_HOURS > 0) {
  const intervalMs = 30 * 60 * 1000;
  setInterval(async () => {
    try {
      const now = Date.now();
      const files = await fs.promises.readdir(DOWNLOAD_DIR);
      await Promise.all(files.map(async (f) => {
        try {
          const full = path.join(DOWNLOAD_DIR, f);
          const st = await fs.promises.stat(full);
          if (now - st.mtimeMs > RETENTION_HOURS * 3600 * 1000) {
            await fs.promises.unlink(full);
            console.log('[retention] deleted stale file:', f);
          }
        } catch (_) {}
      }));
    } catch (e) { console.error('[retention] error:', e); }
  }, intervalMs);
}

app.listen(PORT, () => {
  console.log(`WhatsApp Decrypt API running on port ${PORT}`);
  console.log(`Health: http://localhost:${PORT}/health`);
  console.log(`Static downloads: /downloads/<filename>`);
});
