import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';
// Node 18+ includes a global `fetch` implementation which we rely on

config({ path: '.dev.vars', override: true });

const MCP_ENABLED = process.env.MCP_ENABLED === 'true';
const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';
const AUTH_TOKEN = process.env.AUTH_TOKEN || '';

const DEFAULT_INSTRUCTIONS = `You are helpful and have some tools installed.

In the tools you have the ability to control a robot hand.
`;

const app = express();
app.use(cors());
app.use(express.json());
const auth = (req, res, next) => {
  if (!AUTH_TOKEN) return next();
  const header = req.get('Authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : header;
  if (token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};
app.use('/session', auth);
app.use('/tools', auth);

async function createSession({ instructions = DEFAULT_INSTRUCTIONS, model = process.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2025-06-03', voice } = {}) {
  const body = { model, instructions };
  if (voice) body.voice = voice;
  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function handleSession(req, res, opts = {}) {
  let tools = [];
  if (MCP_ENABLED) {
    try {
      const toolsRes = await fetch(`${MCP_SERVER_URL}/v1/tool`);
      const toolsData = await toolsRes.json();
      tools = Array.isArray(toolsData)
        ? toolsData
        : toolsData.tools ?? toolsData.data ?? [];
    } catch (err) {
      console.warn('Unable to fetch tools:', err);
    }
  }

  try {
    const result = await createSession(opts);
    res.json({ result, tools });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
}

app.get('/session', async (req, res) => {
  handleSession(req, res, {});
});

app.post('/session', async (req, res) => {
  const { instructions, model, voice } = req.body || {};
  handleSession(req, res, { instructions, model, voice });
});

app.get('/tools', async (req, res) => {
  if (!MCP_ENABLED) {
    return res.json({ tools: [] });
  }
  try {
    const response = await fetch(`${MCP_SERVER_URL}/v1/tool`);
    const data = await response.json();
    const tools = Array.isArray(data) ? data : data.tools ?? data.data ?? [];
    res.json({ tools });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

app.post('/tools/:name', express.json(), async (req, res) => {
  if (!MCP_ENABLED) {
    return res.status(400).json({ error: 'MCP disabled' });
  }
  try {
    const { name } = req.params;
    const response = await fetch(
      `${MCP_SERVER_URL}/v1/tool/${encodeURIComponent(name)}/invoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req.body || {}),
      },
    );
    const data = await response.json();
    const result = data && typeof data === 'object'
      ? 'result' in data
        ? data.result
        : 'data' in data
          ? data.data
          : data
      : data;
    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to trigger tool' });
  }
});

app.post('/api/generate-speech', auth, express.json(), async (req, res) => {
  const { text, voice_details, voice: requestedVoice } = req.body || {};

  if (!text) {
    return res.status(400).json({ error: 'Missing text to read' });
  }
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is not set');
    return res
      .status(500)
      .json({ error: 'Server misconfiguration: missing OpenAI key' });
  }

  const openaiVoice = requestedVoice || 'fable';
  const inputText = voice_details ? `${voice_details}. ${text}` : text;

  try {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: inputText,
        voice: openaiVoice,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI TTS error', response.status, errorText);
      return res
        .status(response.status)
        .json({ error: 'Failed to generate speech', details: errorText });
    }

    res.setHeader(
      'Content-Type',
      response.headers.get('content-type') || 'audio/mpeg',
    );
    response.body.pipe(res);
  } catch (err) {
    console.error('Error calling TTS API:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.use(express.static('public'));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
