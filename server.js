const express = require('express');
const cors = require('cors');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
require('dotenv').config({ path: '.dev.vars', override: true });

const DEFAULT_INSTRUCTIONS = `You are helpful and have some tools installed.

In the tools you have the ability to control a robot hand.
`;

const app = express();
app.use(cors());

app.get('/session', async (req, res) => {
  try {
    const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-realtime-preview-2024-12-17',
        instructions: DEFAULT_INSTRUCTIONS,
        voice: 'ash',
      }),
    });
    const result = await response.json();
    res.json({ result });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to create session' });
  }
});

app.use(express.static('public'));

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
