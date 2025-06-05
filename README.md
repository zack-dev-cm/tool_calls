# Client Side Tool Calling with the OpenAI WebRTC Realtime API

This project is a [Cloudflare Workers](https://developers.cloudflare.com) app using [Hono](https://honojs.dev) to relay the [OpenAI Realtime API](https://platform.openai.com/docs/api-reference/realtime) over WebRTC. The main files are just [static assets](https://developers.cloudflare.com/workers/static-assets/).

[<img src="https://img.youtube.com/vi/TcOytsfva0o/0.jpg">](https://youtu.be/TcOytsfva0o "Client Side Tool Calling with the OpenAI WebRTC Realtime API")


## Develop

Copy [.dev.vars.example](./.dev.vars.example) to `.dev.vars` and set both `OPENAI_API_KEY` and `MCP_SERVER_URL`.
`MCP_SERVER_URL` is used for fetching external tools (for example `http://localhost:3000`).

Install your dependencies

```bash
npm install
```

Run local server

```bash
npm run dev
```

## Deploy

Upload your secret

```bash
npx wrangler secret put OPENAI_API_KEY
```

```bash
npm run deploy
```

The hand is a [HiWonder AI Hand](https://www.hiwonder.com/products/aihand?variant=41022039654487). AI and I reverse-engineered the mobile app to make it work over Bluetooth, see [the code in hand.js](./public/hand.js)

## Deploy to Google Cloud Run

Build the container and deploy it using the Google Cloud CLI:

```bash
docker build -t gcr.io/PROJECT_ID/tool-calls .
docker push gcr.io/PROJECT_ID/tool-calls

gcloud run deploy tool-calls \
  --image gcr.io/PROJECT_ID/tool-calls \
  --platform managed \
  --region us-central1 \
  --set-env-vars OPENAI_API_KEY=YOUR_OPENAI_KEY
```

Replace `PROJECT_ID` with your Google Cloud project ID and provide your `OPENAI_API_KEY`.
