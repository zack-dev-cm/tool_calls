const hand = new Hand();
const messagesContainer = document.getElementById('messages');
let toolsList = [];
let peerConnection;
let dataChannel;
let mediaStream;
let currentAssistantEl;

function addMessage(role, text, returnElement = false) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.textContent = text;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
        if (returnElement) return div;
}

function talkToTheHand() {
	hand
		.connect()
		.then(() => console.log('Hand is ready'))
		.catch((err) => console.error(err));
}

const fns = {
	getPageHTML: () => {
		return { success: true, html: document.documentElement.outerHTML };
	},
	changeBackgroundColor: ({ color }) => {
		document.body.style.backgroundColor = color;
		return { success: true, color };
	},
	changeTextColor: ({ color }) => {
		document.body.style.color = color;
		return { success: true, color };
	},
	showFingers: async ({ numberOfFingers }) => {
		await hand.sendCommand(numberOfFingers);
		return { success: true, numberOfFingers };
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
	return toolsList;
}

async function configureData() {
        console.log('Configuring data channel');
        const tools = await loadTools();
        const allTools = tools.concat(TOOL_DESCRIPTORS);
        const event = {
                type: 'session.update',
                session: {
                        modalities: ['text', 'audio'],
                        tools: allTools,
                },
        };
        const includesAll = TOOL_DESCRIPTORS.every((t) => allTools.some((tool) => tool.name === t.name));
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
                mediaStream.getTracks().forEach((track) =>
                        peerConnection.addTransceiver(track, { direction: 'sendrecv' })
                );
                const offer = await peerConnection.createOffer();
                await peerConnection.setLocalDescription(offer);
                const tokenResponse = await fetch('/session');
                console.log('Session status', tokenResponse.status);
                if (!tokenResponse.ok) {
                        const body = await tokenResponse.text();
                        console.error('Session error body', body);
                        alert('Failed to start session. Please try again.');
                        throw new Error('Session request failed');
                }
                const data = await tokenResponse.json();
                const EPHEMERAL_KEY = data.result.client_secret.value;
                const baseUrl = 'https://api.openai.com/v1/realtime';
                const model =
                        window.REALTIME_MODEL || 'gpt-4o-realtime-preview-2025-06-03';
                const r = await fetch(`${baseUrl}?model=${model}`, {
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
                        alert('Failed to connect to OpenAI. Please try again.');
                        throw new Error('OpenAI connection failed');
                }
                const answer = await r.text();
                await peerConnection.setRemoteDescription({
                        sdp: answer,
                        type: 'answer',
                });
        } catch (err) {
                console.error(err);
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

document.getElementById('start-voice').addEventListener('click', startRealtime);
document.getElementById('stop-voice').addEventListener('click', stopRealtime);
document.getElementById('set-instructions').addEventListener('click', sendInstructions);

document.addEventListener('DOMContentLoaded', async () => {
    const tools = await loadTools();
    const list = document.getElementById('tools-list');
    if (list) {
        list.innerHTML = '';
        tools.forEach((tool) => {
            const li = document.createElement('li');
            li.textContent = tool.name;
            list.appendChild(li);
        });
    }
});
