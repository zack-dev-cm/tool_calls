import express from 'express';
import cors from 'cors';
import { config } from 'dotenv';

config({ path: '.dev.vars', override: true });

const MCP_SERVER_URL = process.env.MCP_SERVER_URL || 'http://localhost:3000';

const DEFAULT_INSTRUCTIONS = `You are helpful and have some tools installed.

In the tools you have the ability to control a robot hand.
`;

const app = express();
app.use(cors());

app.get('/session', async (req, res) => {
  try {
    const toolsRes = await fetch(`${MCP_SERVER_URL}/v1/tool`);
    const toolsData = await toolsRes.json();
    const tools = Array.isArray(toolsData)
      ? toolsData
      : toolsData.tools ?? toolsData.data ?? [];
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2025-06-03',
        instructions: DEFAULT_INSTRUCTIONS,
        voice: 'nova',
      }),
    });
    const result = await response.json();
    res.json({ result, tools });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.get('/tools', async (req, res) => {
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

app.use(express.static('public'));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
