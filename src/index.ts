import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fetchTools, triggerTool } from './mcp';

const app = new Hono<{ Bindings: Env }>();
app.use(cors());

const DEFAULT_INSTRUCTIONS = `You are helpful and have some tools installed.

In the tools you have the ability to control a robot hand.
`;

// Learn more: https://platform.openai.com/docs/api-reference/realtime-sessions/create
async function createSession(
        instructions: string | undefined,
        voice: string | undefined,
        env: Env,
) {
        const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
                method: 'POST',
                headers: {
                        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
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

app.get('/session', async (c) => {
        const tools = await fetchTools(c.env.MCP_SERVER_URL);
        const instructions = c.req.query('instructions');
        const voice = c.req.query('voice');
        const result = await createSession(instructions, voice, c.env);
        return c.json({ result, tools });
});

app.post('/session', async (c) => {
        const { instructions, voice } = await c.req.json();
        const tools = await fetchTools(c.env.MCP_SERVER_URL);
        const result = await createSession(instructions, voice, c.env);
        return c.json({ result, tools });
});

app.get('/tools', async (c) => {
        const tools = await fetchTools(c.env.MCP_SERVER_URL);
        return c.json({ tools });
});

app.post('/tools/:name', async (c) => {
        const name = c.req.param('name');
        const args = await c.req.json();
        const result = await triggerTool(name, args, c.env.MCP_SERVER_URL);
        return c.json({ result });
});

app.post('/speech', async (c) => {
        const { text, voice = 'nova', instructions } = await c.req.json();
        const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                        Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
                        'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                        model: 'tts-1',
                        input: text,
                        voice,
                        ...(instructions ? { prompt: instructions } : {}),
                }),
        });
        const arrayBuffer = await response.arrayBuffer();
        return new Response(arrayBuffer, {
                headers: { 'Content-Type': 'audio/mpeg' },
        });
});


export default app;
