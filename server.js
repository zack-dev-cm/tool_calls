import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';

config({ path: '.dev.vars', override: true });

const DEFAULT_INSTRUCTIONS = `You are helpful and have some tools installed.

In the tools you have the ability to control a robot hand.
`;

const app = express();
app.use(cors());

async function createSession(instructions, voice) {
  const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-realtime-preview-2024-12-17',
      instructions: instructions || DEFAULT_INSTRUCTIONS,
      voice: voice || 'ash',
    }),
  });
  return response.json();
}

app.get('/session', async (req, res) => {
  try {
    const toolsRes = await fetch(`${process.env.MCP_SERVER_URL}/tools`);
    const tools = await toolsRes.json();
    const { instructions, voice } = req.query;
    const result = await createSession(instructions, voice);
    res.json({ result, tools });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.post('/session', express.json(), async (req, res) => {
  try {
    const { instructions, voice } = req.body || {};
    const toolsRes = await fetch(`${process.env.MCP_SERVER_URL}/tools`);
    const tools = await toolsRes.json();
    const result = await createSession(instructions, voice);
    res.json({ result, tools });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/tools', async (req, res) => {
  try {
    const response = await fetch(`${process.env.MCP_SERVER_URL}/tools`);
    const tools = await response.json();
    res.json({ tools });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch tools' });
  }
});

app.post('/tools/:name', express.json(), async (req, res) => {
  try {
    const { name } = req.params;
    const response = await fetch(`${process.env.MCP_SERVER_URL}/tools/${encodeURIComponent(name)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body || {}),
    });
    const result = await response.json();
    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to trigger tool' });
  }
});

app.post('/speech', express.json(), async (req, res) => {
  try {
    const { text, voice = 'nova', instructions } = req.body || {};
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice,
        ...(instructions ? { prompt: instructions } : {}),
      }),
    });
    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Speech API error: ${response.status} - ${errText}`);
    }
    const buffer = await response.arrayBuffer();
    res.set('Content-Type', 'audio/mpeg');
    res.send(Buffer.from(buffer));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to synthesize speech' });
  }
});

app.use(express.static('public'));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
