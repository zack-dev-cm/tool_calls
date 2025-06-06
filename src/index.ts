import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { fetchTools, triggerTool, ToolDefinition } from './mcp';

const app = new Hono<{ Bindings: Env }>();
app.use(cors());
const auth = async (c: any, next: any) => {
	if (!c.env.AUTH_TOKEN) return next();
	const header = c.req.header('Authorization') || '';
	const token = header.startsWith('Bearer ') ? header.slice(7) : header;
	if (token !== c.env.AUTH_TOKEN) {
		return c.json({ error: 'Unauthorized' }, 401);
	}
	await next();
};
app.use('/session', auth);
app.use('/tools', auth);
app.use('/tools/*', auth);

const isMcpEnabled = (env: Env) => env.MCP_ENABLED === 'true';

const DEFAULT_INSTRUCTIONS = `You are helpful and have some tools installed.

In the tools you have the ability to control a robot hand.
`;

async function createSession(c: any, instructions: string) {
       let tools: ToolDefinition[] = [];
       if (isMcpEnabled(c.env)) {
               try {
                       tools = await fetchTools(c.env.MCP_SERVER_URL);
               } catch (err) {
                       console.warn('Unable to fetch tools:', err);
               }
       }
       const model = c.env.OPENAI_REALTIME_MODEL || 'gpt-4o-realtime-preview-2025-06-03';
       const response = await fetch('https://api.openai.com/v1/realtime/sessions', {
               method: 'POST',
               headers: {
                       Authorization: `Bearer ${c.env.OPENAI_API_KEY}`,
                       'Content-Type': 'application/json',
               },
               body: JSON.stringify({
                       model,
                       instructions,
               }),
       });
       const result = await response.json();
       return c.json({ result, tools });
}

// Learn more: https://platform.openai.com/docs/api-reference/realtime-sessions/create
app.get('/session', async (c) => {
       return createSession(c, DEFAULT_INSTRUCTIONS);
});

app.post('/session', async (c) => {
       let body: { instructions?: string } = {};
       try {
               body = await c.req.json();
       } catch {
               body = {};
       }
       return createSession(c, body.instructions || DEFAULT_INSTRUCTIONS);
});

app.get('/tools', async (c) => {
        if (!isMcpEnabled(c.env)) {
                return c.json({ tools: [] });
        }
        try {
                const tools = await fetchTools(c.env.MCP_SERVER_URL);
                return c.json({ tools });
        } catch (err) {
                console.warn('Unable to fetch tools:', err);
                return c.json({ tools: [] });
        }
});

app.post('/tools/:name', async (c) => {
        if (!isMcpEnabled(c.env)) {
                return c.json({ error: 'MCP disabled' }, 400);
        }
        const name = c.req.param('name');
        const args = await c.req.json();
        const result = await triggerTool(name, args, c.env.MCP_SERVER_URL);
        return c.json({ result });
});

export default app;
