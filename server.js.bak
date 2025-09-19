const express = require("express");
const { decodeWhatsAppMedia } = require("./decode");

const app = express();
const port = process.env.PORT || 3000;

// Middleware to parse JSON bodies
app.use(express.json());

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok" });
});

// POST endpoint for media decoding
app.post("/decode", async (req, res) => {
  try {
    // Validate request body
    if (!req.body) {
      return res.status(400).json({ error: "Request body is required" });
    }

    // Decode the media
    const data = req.body;

    // Get the file extension from mimetype
    const extension = data.mimetype
      ? `.${data.mimetype.split("/")[1].split(";")[0]}`
      : "";

    // Set response headers for file download
    res.setHeader("Content-Type", data.mimetype || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="decoded_media${extension}"`
    );

    // Decode and stream directly to response
    const result = await decodeWhatsAppMedia(data, "base64");
    const buffer = Buffer.from(result, "base64");
    res.send(buffer);
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: error.message });
  }
});

// Start server
app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});
