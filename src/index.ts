import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fetchTools, triggerTool, ToolDefinition } from './mcp';

const app = new Hono<{ Bindings: Env }>();
app.use(cors());

const DEFAULT_INSTRUCTIONS = `You are helpful and have some tools installed.

In the tools you have the ability to control a robot hand.
`;

// Learn more: https://platform.openai.com/docs/api-reference/realtime-sessions/create
app.get('/session', async (c) => {
        let tools: ToolDefinition[] = [];
        try {
                tools = await fetchTools(c.env.MCP_SERVER_URL);
        } catch (err) {
                console.warn('Unable to fetch tools:', err);
        }
        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
                method: 'POST',
                headers: {
                        Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                        model: 'gpt-4o-realtime-preview-2024-12-17',
                        instructions: DEFAULT_INSTRUCTIONS,
                        voice: 'ash',
                }),
        });
        const result = await response.json();
        return c.json({ result, tools });
});

app.get('/tools', async (c) => {
        try {
                const tools = await fetchTools(c.env.MCP_SERVER_URL);
                return c.json({ tools });
        } catch (err) {
                console.warn('Unable to fetch tools:', err);
                return c.json({ tools: [] });
        }
});

app.post('/tools/:name', async (c) => {
        const name = c.req.param('name');
        const args = await c.req.json();
        const result = await triggerTool(name, args, c.env.MCP_SERVER_URL);
        return c.json({ result });
});


export default app;
