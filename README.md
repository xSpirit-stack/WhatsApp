# WhatsApp Media Decoder

A Node.js service to decode encrypted WhatsApp media files.

Ps: You don't need this if you are running the Official Meta Business API for Whatsapp.

## Features

- Decodes encrypted WhatsApp media files (audio, video, images, documents)
- HTTP API endpoint for decoding
- Docker support
- Health check endpoint

## Deployment

### Using Coolify

1. Create a new service in Coolify
2. Configure the following settings:
   - Port: 8889
   - Build Command: `npm install`
   - Start Command: `node server.js`
   - Healthcheck Path: `/health`

The service will be available at: `https://<your-coolify-domain>/decode`

### Manual Docker Deployment

1. Clone the repository:

```bash
git clone <repository-url>
cd whatsapp-decoder
```

2. Build and start the container:

```bash
docker-compose up -d
```

The service will be available at: `http://localhost:8889/decode`

## API Usage

### Decode Media

**Endpoint:** `POST /decode`

**Request Body:**

```json
{
  "url": "https://mmg.whatsapp.net/...",
  "mediaKey": "base64-encoded-key",
  "messageType": "audioMessage",
  "whatsappTypeMessageToDecode": "WhatsApp Audio Keys",
  "mimetype": "audio/ogg; codecs=opus"
}
```

**Example using curl:**

```bash
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://mmg.whatsapp.net/v/t62.7117-24/21194290_1296476371623670_179004075373174348_n.enc?ccb=11-4&oh=01_Q5AaIPh0HEsmQYGqXEgvfRKhO_SreEcAzRLpGQJGa4APyiDy&oe=67D5FCF8&_nc_sid=5e03e0",
    "mediaKey": "1mjE/yviJxTUXSdvUDfYe9ofDogfHy1tdFMgbmIFmik=",
    "messageType": "audioMessage",
    "whatsappTypeMessageToDecode": "WhatsApp Audio Keys",
    "mimetype": "audio/ogg; codecs=opus"
  }' \
  -o decoded_media.ogg \
  http://localhost:8889/decode
```

**Response:**

- Binary file with appropriate Content-Type and Content-Disposition headers

### Health Check

**Endpoint:** `GET /health`

**Response:**

```json
{
  "status": "ok"
}
```

## Environment Variables

- `PORT`: Server port (default: 8889)
- `NODE_ENV`: Node environment (default: production)
- `SERVICE_FQDN_WHATSAPP_DECODER_8889`: Service FQDN for Coolify (set automatically)

## Development

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
node server.js
```

## Docker Configuration

The service includes:

- Health check endpoint
- Automatic restart policy
- Environment variable support
- Alpine-based Node.js image
- Production-ready configuration

## License

MIT
