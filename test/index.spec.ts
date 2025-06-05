// test/index.spec.ts
import { env, createExecutionContext, waitOnExecutionContext, SELF } from 'cloudflare:test';
import { describe, it, expect } from 'vitest';
import worker from '../src/index';

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
const IncomingRequest = Request<unknown, IncomingRequestCfProperties>;

describe('Hello World worker', () => {
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
		expect(await response.text()).toMatchInlineSnapshot(`
			"<!DOCTYPE html>
			<html lang="en">
			<head>
			  <meta charset="UTF-8" />
			  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
			  <title>Material Chat Demo</title>
			  <link href="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/css/materialize.min.css" rel="stylesheet">
			  <link rel="stylesheet" href="/styles.css" />
			</head>
			<body class="blue-grey lighten-5">
			  <nav>
			    <div class="nav-wrapper teal">
			      <a href="#" class="brand-logo center">Material Chat</a>
			    </div>
			  </nav>
			  <main class="container content">
			    <div class="section">
			      <button class="btn waves-effect waves-light" onclick="talkToTheHand()">Talk to the hand</button>
			    </div>
			    <div id="chat" class="chat">
			      <div id="messages" class="messages"></div>
			    </div>
			  </main>
			  <footer class="page-footer teal">
			    <div class="footer-copyright">
			      <div class="container">
			        <p>Built with 🧡 on <a class="white-text" href="https://developers.cloudflare.com">Cloudflare Workers</a> and the <a class="white-text" href="https://platform.openai.com/docs/api-reference/realtime">OpenAI Realtime API</a></p>
			      </div>
			    </div>
			  </footer>
			  <script src="https://cdnjs.cloudflare.com/ajax/libs/materialize/1.0.0/js/materialize.min.js"></script>
			  <script src="/hand.js"></script>
			  <script src="/script.js"></script>
			</body>
			</html>
			"
		`);
	});
});
