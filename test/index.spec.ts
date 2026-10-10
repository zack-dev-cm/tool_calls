// test/index.spec.ts
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect, vi, afterEach } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Hello World worker', () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		env.AUTH_TOKEN = '';
	});
	it('responds with Hello World! (unit style)', async () => {
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`"404 Not Found"`);
	});

	it('responds with Hello World! (integration style)', async () => {
		const response = await SELF.fetch('https://example.com');
		const text = await response.text();
		expect(text).toContain('<div id="tools-panel"');
	});

	it('rejects unauthorized API requests', async () => {
		env.AUTH_TOKEN = 'secret';
		const request = new IncomingRequest('http://example.com/session');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(401);
	});

	it('accepts authorized API requests', async () => {
		env.AUTH_TOKEN = 'secret';
		const sessionFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			client_secret: { value: 'test-ephemeral' },
		})));
		vi.stubGlobal('fetch', sessionFetch);
		const request = new IncomingRequest('http://example.com/session');
		request.headers.set('Authorization', 'Bearer secret');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			result: { client_secret: { value: 'test-ephemeral' } }, tools: [],
		});
		expect(sessionFetch).toHaveBeenCalledOnce();
	});
});
