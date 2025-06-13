const hand = new Hand();
const messagesContainer = document.getElementById('messages');
let toolsList = [];
let peerConnection;
let dataChannel;
let mediaStream;
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

async function loadTools() {
	const res = await fetch('/tools');
	const data = await res.json();
	toolsList = data.tools || [];
	availableTools = toolsList.concat(TOOL_DESCRIPTORS);
	return availableTools;
}

async function configureData() {
	console.log('Configuring data channel');
	await loadTools();
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
	dataChannel.send(JSON.stringify(event));
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

function setupPeerConnection() {
	peerConnection = new RTCPeerConnection();

	peerConnection.ontrack = (event) => {
		const el = document.createElement('audio');
		el.srcObject = event.streams[0];
		el.autoplay = el.controls = true;
		document.body.appendChild(el);
	};

	dataChannel = peerConnection.createDataChannel('oai-events');
	dataChannel.addEventListener('open', (ev) => {
		console.log('Opening data channel', ev);
		configureData();
		sendInstructions();
	});

	dataChannel.addEventListener('message', async (ev) => {
		const msg = JSON.parse(ev.data);
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
			const fn = fns[msg.name];
			let result;
			const args = JSON.parse(msg.arguments);
			if (fn !== undefined) {
				console.log(`Calling local function ${msg.name} with ${msg.arguments}`);
				result = await fn(args);
			} else {
				const resp = await fetch(`/tools/${msg.name}`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(args),
				});
				result = await resp.json();
				showNotification(`Tool ${msg.name} executed`, resp.ok);
			}
			console.log('result', result);
			const event = {
				type: 'conversation.item.create',
				item: {
					type: 'function_call_output',
					call_id: msg.call_id,
					output: JSON.stringify(result),
				},
			};
			dataChannel.send(JSON.stringify(event));
			dataChannel.send(JSON.stringify({ type: 'response.create' }));
		}
	});
}

async function startRealtime() {
	try {
		setupPeerConnection();
		mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
		mediaStream.getTracks().forEach((track) => peerConnection.addTransceiver(track, { direction: 'sendrecv' }));
		const offer = await peerConnection.createOffer();
		await peerConnection.setLocalDescription(offer);
                const instructionsInput = document.getElementById('instructions-input');
                const instructions = instructionsInput?.value || '';
                const voiceSelect = document.getElementById('voice-select');
                const voice = voiceSelect?.value || 'nova';
                const tokenResponse = await fetch('/session', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ instructions, model: window.REALTIME_MODEL, voice }),
                });
		console.log('Session status', tokenResponse.status);
		if (!tokenResponse.ok) {
			const body = await tokenResponse.text();
			console.error('Session error body', body);
			showNotification('Failed to start session', false);
			throw new Error('Session request failed');
		}
                const data = await tokenResponse.json();
                const EPHEMERAL_KEY = data.result?.client_secret?.value;
                if (!EPHEMERAL_KEY) {
                        console.error('Missing client secret in session response', data);
                        showNotification('Failed to start session', false);
                        throw new Error('Missing client secret');
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
		});
		console.log('OpenAI status', r.status);
		if (!r.ok) {
			const body = await r.text();
			console.error('OpenAI error body', body);
			showNotification('Failed to connect to OpenAI', false);
			throw new Error('OpenAI connection failed');
		}
		const answer = await r.text();
		await peerConnection.setRemoteDescription({
			sdp: answer,
			type: 'answer',
		});
		showNotification('Realtime session started', true);
	} catch (err) {
		console.error(err);
		showNotification('Error starting session', false);
		stopRealtime();
	}
}

function stopRealtime() {
	if (dataChannel) dataChannel.close();
	if (peerConnection) peerConnection.close();
	if (mediaStream) mediaStream.getTracks().forEach((t) => t.stop());
	peerConnection = undefined;
	dataChannel = undefined;
	mediaStream = undefined;
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
