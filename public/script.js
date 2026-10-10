const hand = new Hand();
const messagesContainer = document.getElementById('messages');
let toolsList = [];
let dataChannel;
let realtimeSession;
let currentAssistantEl;
let availableTools = [];
const VOICES = ['nova', 'onyx', 'alloy', 'echo', 'fable', 'shimmer', 'ash'];
const MODELS = ['gpt-4o-realtime-preview-2025-06-03', 'gpt-4o-realtime-preview-2024-12-17'];
const EXAMPLE_INSTRUCTIONS = `# Personality and Tone
## Identity
You are a helpful assistant that speaks with a friendly tone.
## Instructions
- If a user provides a name or phone number, repeat it back to confirm.
- Acknowledge any corrections.`;

function showNotification(message, success = true) {
	if (window.M && M.toast) {
		M.toast({ html: message, classes: success ? 'green' : 'red' });
	} else {
		alert(message);
	}
}

function addMessage(role, text, returnElement = false) {
	const div = document.createElement('div');
	div.className = `message ${role}`;
	div.textContent = text;
	messagesContainer.appendChild(div);
	messagesContainer.scrollTop = messagesContainer.scrollHeight;
	if (returnElement) return div;
}

const ALLOWED_EMAIL = 'kaisenaiko@gmail.com';

function verifyUserAuth() {
        const stored = localStorage.getItem('userEmail');
        if (stored === ALLOWED_EMAIL) return true;
        const email = prompt('Enter email to control the device:');
        if (email === ALLOWED_EMAIL) {
                localStorage.setItem('userEmail', email);
                return true;
        }
        alert('Unauthorized user');
        return false;
}

function controlBluetoothDevice() {
        if (!verifyUserAuth()) return;
        hand
                .connect()
                .then((ok) => {
                        if (ok) {
                                console.log('Hand is ready');
                                showNotification('Hand connected', true);
                        } else {
                                showNotification('Failed to connect to hand', false);
                        }
                })
                .catch((err) => {
                        console.error(err);
                        showNotification('Failed to connect to hand', false);
                });
}

const fns = {
	getPageHTML: () => {
		return { success: true, html: document.documentElement.outerHTML };
	},
	changeBackgroundColor: ({ color }) => {
		document.body.style.backgroundColor = color;
		showNotification(`Background color changed to ${color}`);
		return { success: true, color };
	},
	changeTextColor: ({ color }) => {
		document.body.style.color = color;
		showNotification(`Text color changed to ${color}`);
		return { success: true, color };
	},
	showFingers: async ({ numberOfFingers }) => {
		const ok = await hand.sendCommand(numberOfFingers);
		showNotification(ok ? `Showing ${numberOfFingers} fingers` : 'Failed to control hand', ok);
		return { success: ok, numberOfFingers };
	},
};

const TOOL_DESCRIPTORS = [
	{
		type: 'function',
		name: 'changeBackgroundColor',
		description: 'Change the background color of the page',
		parameters: {
			type: 'object',
			properties: {
				color: {
					type: 'string',
					description: 'CSS color value to set as the background',
				},
			},
			required: ['color'],
		},
	},
	{
		type: 'function',
		name: 'changeTextColor',
		description: 'Change the text color of the page',
		parameters: {
			type: 'object',
			properties: {
				color: {
					type: 'string',
					description: 'CSS color value to set as the text color',
				},
			},
			required: ['color'],
		},
	},
	{
		type: 'function',
		name: 'showFingers',
		description: 'Display a specific number of fingers on the robot hand',
		parameters: {
			type: 'object',
			properties: {
				numberOfFingers: {
					type: 'integer',
					description: 'Number of fingers to raise (0-5)',
					minimum: 0,
					maximum: 5,
				},
			},
			required: ['numberOfFingers'],
		},
	},
];

async function loadTools(signal) {
	const res = await fetch('/tools', signal ? { signal } : undefined);
	const data = await res.json();
	toolsList = data.tools || [];
	availableTools = toolsList.concat(TOOL_DESCRIPTORS);
	return availableTools;
}

async function configureData(session) {
	console.log('Configuring data channel');
	await loadTools(session.controller.signal);
	if (realtimeSession !== session || session.channel.readyState !== 'open') return;
	const selected = availableTools.filter((t) => {
		const cb = document.querySelector(`input.tool-checkbox[data-tool-name="${t.name}"]`);
		return !cb || cb.checked;
	});
	const voiceSelect = document.getElementById('voice-select');
	const voice = voiceSelect ? voiceSelect.value : 'nova';
	const event = {
		type: 'session.update',
		session: {
			modalities: ['text', 'audio'],
			voice,
			tools: selected,
		},
	};
	const includesAll = TOOL_DESCRIPTORS.every((t) => selected.some((tool) => tool.name === t.name));
	if (!includesAll) {
		console.error('Missing local tools in session.update', event);
	}
	session.channel.send(JSON.stringify(event));
}

function sendInstructions() {
	const input = document.getElementById('instructions-input');
	if (!input || !dataChannel || dataChannel.readyState !== 'open') return;
	const event = {
		type: 'session.update',
		session: {
			instructions: input.value,
		},
	};
	dataChannel.send(JSON.stringify(event));
}

function sendVoice() {
	const select = document.getElementById('voice-select');
	if (!select || !dataChannel || dataChannel.readyState !== 'open') return;
	const event = {
		type: 'session.update',
		session: {
			voice: select.value,
		},
	};
	dataChannel.send(JSON.stringify(event));
}

function sendModel() {
	const select = document.getElementById('model-select');
	if (!select) return;
	window.REALTIME_MODEL = select.value;
}

function loadExampleInstructions() {
	const input = document.getElementById('instructions-input');
	if (input) {
		input.value = EXAMPLE_INSTRUCTIONS;
	}
}

function randomVoice() {
	const select = document.getElementById('voice-select');
	if (!select) return;
	const index = Math.floor(Math.random() * VOICES.length);
	select.value = VOICES[index];
	sendVoice();
}

function setupPeerConnection(session) {
	const peer = session.peer = new RTCPeerConnection();

	peer.ontrack = (event) => {
		if (realtimeSession !== session) return;
		const el = document.createElement('audio');
		el.srcObject = event.streams[0];
		el.autoplay = el.controls = true;
		document.body.appendChild(el);
		session.audio.push(el);
	};
	peer.onconnectionstatechange = () => {
		if (realtimeSession === session && ['failed', 'closed'].includes(peer.connectionState)) {
			stopRealtime();
			setRealtimeStatus('Connection ended. You can start again.');
		}
	};

	const channel = session.channel = peer.createDataChannel('oai-events');
	dataChannel = channel;
	channel.addEventListener('close', () => {
		if (realtimeSession === session) stopRealtime();
	});
	channel.addEventListener('open', async () => {
		if (realtimeSession !== session) return;
		try {
			await configureData(session);
			if (realtimeSession === session && channel.readyState === 'open') sendInstructions();
		} catch {
			if (realtimeSession !== session) return;
			stopRealtime();
			setRealtimeStatus('Could not configure the session. Try again.');
			showNotification('Could not configure the session. Try again.', false);
		}
	});

	channel.addEventListener('message', async (ev) => {
		if (realtimeSession !== session) return;
		let msg;
		try {
			msg = JSON.parse(ev.data);
		} catch {
			showNotification('Could not read the realtime event', false);
			return;
		}
		if (!msg || typeof msg.type !== 'string') return;
		if (msg.type && msg.type.startsWith('transcript')) {
			const text = msg.transcript || msg.text;
			if (text) addMessage('user', text);
		}
		if (msg.type === 'response.text.delta') {
			const text = msg.delta || msg.text;
			if (text) {
				if (!currentAssistantEl) {
					currentAssistantEl = addMessage('assistant', text, true);
				} else {
					currentAssistantEl.textContent += text;
					messagesContainer.scrollTop = messagesContainer.scrollHeight;
				}
			}
		} else if (msg.type === 'response.text.done' || msg.type === 'response.done') {
			currentAssistantEl = undefined;
		} else if (msg.type && msg.type.startsWith('response')) {
			const text = msg.text || msg.delta;
			if (text) addMessage('assistant', text);
		}
		if (msg.type === 'response.function_call_arguments.done') {
			try {
				const fn = fns[msg.name];
				let result;
				const args = JSON.parse(msg.arguments);
				if (fn !== undefined) {
					result = await fn(args);
				} else {
					const resp = await fetch(`/tools/${msg.name}`, {
						method: 'POST',
						headers: { 'Content-Type': 'application/json' },
						body: JSON.stringify(args),
						signal: session.controller.signal,
					});
					result = await resp.json();
					if (realtimeSession !== session) return;
					showNotification(`Tool ${msg.name} executed`, resp.ok);
				}
				if (realtimeSession !== session || channel.readyState !== 'open') return;
				const event = {
					type: 'conversation.item.create',
					item: {
						type: 'function_call_output',
						call_id: msg.call_id,
						output: JSON.stringify(result),
					},
				};
				channel.send(JSON.stringify(event));
				channel.send(JSON.stringify({ type: 'response.create' }));
			} catch {
				if (realtimeSession === session) showNotification('Could not run the realtime tool', false);
			}
		}
	});
}

function setRealtimeStatus(message) {
	const status = document.getElementById('connection-status');
	if (status) status.textContent = message;
}

function updateRealtimeControls(active) {
	const start = document.getElementById('start-voice');
	const stop = document.getElementById('stop-voice');
	if (start) start.disabled = active;
	if (stop) stop.disabled = !active;
}

async function startRealtime() {
	if (realtimeSession) return;
	const session = { controller: new AbortController(), audio: [] };
	realtimeSession = session;
	updateRealtimeControls(true);
	setRealtimeStatus('Connecting…');
	try {
		setupPeerConnection(session);
		const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
		if (realtimeSession !== session) {
			stream.getTracks().forEach((track) => track.stop());
			return;
		}
		session.stream = stream;
		stream.getTracks().forEach((track) => session.peer.addTransceiver(track, { direction: 'sendrecv' }));
		const offer = await session.peer.createOffer();
		if (realtimeSession !== session) return;
		await session.peer.setLocalDescription(offer);
		if (realtimeSession !== session) return;
                const instructionsInput = document.getElementById('instructions-input');
                const instructions = instructionsInput?.value || '';
                const voiceSelect = document.getElementById('voice-select');
                const voice = voiceSelect?.value || 'nova';
                const tokenResponse = await fetch('/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ instructions, model: window.REALTIME_MODEL, voice }),
                        signal: session.controller.signal,
                });
		if (realtimeSession !== session) return;
		console.log('Session status', tokenResponse.status);
		if (!tokenResponse.ok) {
			throw new Error(`Session request failed (${tokenResponse.status}). Try again.`);
		}
                const data = await tokenResponse.json();
                if (realtimeSession !== session) return;
                const EPHEMERAL_KEY = data?.result?.client_secret?.value;
                if (typeof EPHEMERAL_KEY !== 'string' || !EPHEMERAL_KEY.trim()) {
                        throw new Error('The server did not return a session token. Try again.');
                }
                const baseUrl = 'https://api.openai.com/v1/realtime';
                const model = window.REALTIME_MODEL || 'gpt-4o-realtime-preview-2025-06-03';
                const r = await fetch(`${baseUrl}?model=${model}&voice=${voice}`, {
			method: 'POST',
			body: offer.sdp,
			headers: {
				Authorization: `Bearer ${EPHEMERAL_KEY}`,
				'Content-Type': 'application/sdp',
			},
			signal: session.controller.signal,
		});
		if (realtimeSession !== session) return;
		console.log('OpenAI status', r.status);
		if (!r.ok) {
			throw new Error(`Voice connection failed (${r.status}). Try again.`);
		}
		const answer = await r.text();
		if (realtimeSession !== session) return;
		await session.peer.setRemoteDescription({
			sdp: answer,
			type: 'answer',
		});
		if (realtimeSession !== session) return;
		setRealtimeStatus('Voice session ready.');
		showNotification('Realtime session started', true);
	} catch (err) {
		if (realtimeSession !== session) return;
		// Do not log session responses or ephemeral credentials on failure.
		const message = err instanceof Error && /^(Session request failed|Voice connection failed|The server did not return)/.test(err.message)
			? err.message : 'Could not start voice. Check microphone access and try again.';
		stopRealtime();
		setRealtimeStatus(message);
		showNotification(message, false);
	}
}

function stopRealtime() {
	const session = realtimeSession;
	realtimeSession = undefined;
	if (session) {
		session.controller.abort();
		if (session.channel) session.channel.close();
		if (session.peer) session.peer.close();
		if (session.stream) session.stream.getTracks().forEach((track) => track.stop());
		session.audio.forEach((el) => { el.srcObject = null; el.remove(); });
	}
	dataChannel = undefined;
	currentAssistantEl = undefined;
	updateRealtimeControls(false);
	setRealtimeStatus('Voice session stopped.');
}

const startBtn = document.getElementById('start-voice');
if (startBtn) startBtn.addEventListener('click', startRealtime);

const stopBtn = document.getElementById('stop-voice');
if (stopBtn) stopBtn.addEventListener('click', stopRealtime);

const setInstructionsBtn = document.getElementById('set-instructions');
if (setInstructionsBtn) setInstructionsBtn.addEventListener('click', sendInstructions);

const voiceSelectEl = document.getElementById('voice-select');
if (voiceSelectEl) voiceSelectEl.addEventListener('change', sendVoice);

const modelSelectEl = document.getElementById('model-select');
if (modelSelectEl) modelSelectEl.addEventListener('change', sendModel);

const randomVoiceBtn = document.getElementById('random-voice');
if (randomVoiceBtn) randomVoiceBtn.addEventListener('click', randomVoice);

const loadExampleBtn = document.getElementById('load-example');
if (loadExampleBtn) loadExampleBtn.addEventListener('click', loadExampleInstructions);

document.addEventListener('DOMContentLoaded', async () => {
        const dropdowns = document.querySelectorAll('.dropdown-trigger');
        if (window.M && M.Dropdown) M.Dropdown.init(dropdowns);
        const voiceSelect = document.getElementById('voice-select');
	if (voiceSelect) {
		voiceSelect.innerHTML = '';
		VOICES.forEach((v) => {
			const opt = document.createElement('option');
			opt.value = v;
			opt.textContent = v;
			voiceSelect.appendChild(opt);
		});
	}
	const modelSelect = document.getElementById('model-select');
	if (modelSelect) {
		modelSelect.innerHTML = '';
		MODELS.forEach((m) => {
			const opt = document.createElement('option');
			opt.value = m;
			opt.textContent = m.includes('2024') ? 'legacy' : 'latest';
			modelSelect.appendChild(opt);
		});
		window.REALTIME_MODEL = modelSelect.value;
	}
	const tools = await loadTools();
	const list = document.getElementById('tools-list');
	if (list) {
		list.innerHTML = '';
		tools.forEach((tool) => {
			const li = document.createElement('li');
			const label = document.createElement('label');
			const checkbox = document.createElement('input');
			checkbox.type = 'checkbox';
			checkbox.className = 'filled-in tool-checkbox';
			checkbox.checked = true;
			checkbox.dataset.toolName = tool.name;
			const span = document.createElement('span');
			span.textContent = tool.name;
			label.appendChild(checkbox);
			label.appendChild(span);
			li.appendChild(label);

			const button = document.createElement('button');
			button.textContent = 'Run';
			button.className = 'btn waves-effect waves-light tool-button';
			button.addEventListener('click', async () => {
				try {
					if (fns[tool.name]) {
						const result = await fns[tool.name]({});
						showNotification(`Tool ${tool.name} executed`, result.success !== false);
					} else {
						const resp = await fetch(`/tools/${tool.name}`, {
							method: 'POST',
							headers: { 'Content-Type': 'application/json' },
							body: JSON.stringify({}),
						});
						const data = await resp.json();
						showNotification(`Tool ${tool.name} executed`, resp.ok);
						console.log('Tool result', data);
					}
				} catch (err) {
					console.error('Failed to invoke tool', err);
					showNotification(`Tool ${tool.name} failed`, false);
				}
			});
			li.appendChild(button);
			list.appendChild(li);
		});
	}
});
