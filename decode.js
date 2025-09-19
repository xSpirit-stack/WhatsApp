#!/usr/bin/env node

const crypto = require("crypto");
const axios = require("axios");
const fs = require("fs").promises;

async function decodeWhatsAppMedia(data, outputType = "file") {
  try {
    console.log("\nInput Data:", JSON.stringify(data, null, 2));

    // Validate required fields
    const requiredFields = [
      "url",
      "mediaKey",
      "messageType",
      "whatsappTypeMessageToDecode",
    ];
    for (const field of requiredFields) {
      if (!data[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    // Download the encrypted file
    console.log("\nDownloading from URL:", data.url);
    const response = await axios.get(data.url, { responseType: "arraybuffer" });
    const encryptedData = Buffer.from(response.data);
    console.log("Downloaded data length:", encryptedData.length);

    // Decode the media key from base64
    const mediaKeyBuffer = Buffer.from(data.mediaKey, "base64");
    console.log("\nMedia Key (hex):", mediaKeyBuffer.toString("hex"));

    // Expand the media key using HKDF
    const mediaKeyExpanded = expandMediaKey(
      mediaKeyBuffer,
      data.whatsappTypeMessageToDecode
    );
    console.log("Expanded Media Key (hex):", mediaKeyExpanded.toString("hex"));

    // Remove the last 10 bytes as per Python implementation
    const file = encryptedData.slice(0, -10);

    // Get the key and IV from expanded media key
    const key = mediaKeyExpanded.slice(16, 48);
    const iv = mediaKeyExpanded.slice(0, 16);

    console.log("\nKey (hex):", key.toString("hex"));
    console.log("IV (hex):", iv.toString("hex"));
    console.log("Encrypted length:", file.length);

    // Create decipher
    const decipher = crypto.createDecipheriv("aes-256-cbc", key, iv);
    decipher.setAutoPadding(true);

    // Decrypt
    const decryptedMedia = Buffer.concat([
      decipher.update(file),
      decipher.final(),
    ]);

    console.log("Decrypted media length:", decryptedMedia.length);

    // Handle output based on outputType
    if (outputType === "base64") {
      return decryptedMedia.toString("base64");
    } else {
      // Generate output filename based on mimetype
      const extension = data.mimetype
        ? `.${data.mimetype.split("/")[1].split(";")[0]}`
        : "";
      const outputFilename = `decoded_media${extension}`;
      await fs.writeFile(outputFilename, decryptedMedia);
      return `File saved as: ${outputFilename}`;
    }
  } catch (error) {
    console.error("\nError:", error.message);
    throw error;
  }
}

function expandMediaKey(mediaKey, type) {
  // Implementation of HKDF matching Python version
  const salt = Buffer.from(new Array(32).fill(0));
  const info = Buffer.from(type);

  // Step 1: Extract
  const prk = crypto.createHmac("sha256", salt).update(mediaKey).digest();

  // Step 2: Expand
  let keyStream = Buffer.alloc(0);
  let keyBlock = Buffer.alloc(0);
  let blockIndex = 1;

  while (keyStream.length < 112) {
    const hmac = crypto.createHmac("sha256", prk);
    hmac.update(Buffer.concat([keyBlock, info, Buffer.from([blockIndex])]));
    keyBlock = hmac.digest();
    keyStream = Buffer.concat([keyStream, keyBlock]);
    blockIndex++;
  }

  return keyStream.slice(0, 112);
}

// Main execution
if (require.main === module) {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error("Please provide the data object as an argument");
    process.exit(1);
  }

  try {
    const data = JSON.parse(args[0]);
    const outputType = args[1] === "output_type=base64" ? "base64" : "file";

    decodeWhatsAppMedia(data, outputType)
      .then((result) => console.log(result))
      .catch((error) => {
        console.error("Error:", error.message);
        process.exit(1);
      });
  } catch (error) {
    console.error("Error parsing JSON input:", error.message);
    process.exit(1);
  }
}

module.exports = { decodeWhatsAppMedia };
