import express from 'express';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const tools = [
  {
    type: 'function',
    name: 'helloWorld',
    description: 'Returns a friendly greeting',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name to greet' }
      },
    },
  },
  {
    type: 'function',
    name: 'echo',
    description: 'Echos back whatever is provided',
    parameters: {
      type: 'object',
      additionalProperties: true,
    },
  },
];

app.get('/v1/tool', (req, res) => {
  res.json({ tools });
});

app.post('/v1/tool/:name/invoke', (req, res) => {
  const { name } = req.params;
  const args = req.body || {};
  if (name === 'helloWorld') {
    const person = args.name || 'World';
    return res.json({ result: `Hello, ${person}!` });
  }
  res.json({ result: args });
});

const port = process.env.MCP_PORT || 3000;
app.listen(port, () => {
  console.log(`Mock MCP server listening on port ${port}`);
});
