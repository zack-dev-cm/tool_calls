const hand = new Hand();
const messagesContainer = document.getElementById('messages');

let recognition;
let toolsList = [];

function addMessage(role, text) {
        const div = document.createElement('div');
        div.className = `message ${role}`;
        div.textContent = text;
        messagesContainer.appendChild(div);
        messagesContainer.scrollTop = messagesContainer.scrollHeight;
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

function handleVoiceCommand(text) {
        const lower = text.toLowerCase().trim();
        addMessage('user', text);
        if (lower.startsWith('change background color to ')) {
                const color = lower.replace('change background color to ', '');
                fns.changeBackgroundColor({ color });
                return;
        }
        if (lower.startsWith('change text color to ')) {
                const color = lower.replace('change text color to ', '');
                fns.changeTextColor({ color });
                return;
        }
        if (lower.startsWith('show fingers ')) {
                const num = parseInt(lower.replace('show fingers ', ''), 10);
                if (!isNaN(num)) fns.showFingers({ numberOfFingers: num });
                return;
        }
        if (fns[lower]) {
                fns[lower]({});
                return;
        }
        const tool = toolsList.find((t) => t.name.toLowerCase() === lower);
        if (tool) {
                fetch(`/tools/${tool.name}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({}),
                });
        }
}

function startVoice() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
                alert('Speech recognition not supported');
                return;
        }
        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.onresult = (e) => {
                const transcript = Array.from(e.results)
                        .map((r) => r[0].transcript)
                        .join(' ');
                handleVoiceCommand(transcript);
        };
        recognition.start();
        document.getElementById('start-voice').disabled = true;
        document.getElementById('stop-voice').disabled = false;
}

function stopVoice() {
        if (recognition) recognition.stop();
        document.getElementById('start-voice').disabled = false;
        document.getElementById('stop-voice').disabled = true;
}

// Create a WebRTC Agent
const peerConnection = new RTCPeerConnection();

// On inbound audio add to page
peerConnection.ontrack = (event) => {
	const el = document.createElement('audio');
	el.srcObject = event.streams[0];
	el.autoplay = el.controls = true;
	document.body.appendChild(el);
};

const dataChannel = peerConnection.createDataChannel('oai-events');
async function loadTools() {
        const res = await fetch('/tools');
        const data = await res.json();
        toolsList = data.tools || [];
        return toolsList;
}

async function configureData() {
        console.log('Configuring data channel');
        const tools = await loadTools();
        const event = {
                type: 'session.update',
                session: {
                        modalities: ['text', 'audio'],
                        tools,
                },
        };
        dataChannel.send(JSON.stringify(event));
}

dataChannel.addEventListener('open', (ev) => {
	console.log('Opening data channel', ev);
	configureData();
});


// {
//     "type": "response.function_call_arguments.done",
//     "event_id": "event_Ad2gt864G595umbCs2aF9",
//     "response_id": "resp_Ad2griUWUjsyeLyAVtTtt",
//     "item_id": "item_Ad2gsxA84w9GgEvFwW1Ex",
//     "output_index": 1,
//     "call_id": "call_PG12S5ER7l7HrvZz",
//     "name": "get_weather",
//     "arguments": "{\"location\":\"Portland, Oregon\"}"
// }

dataChannel.addEventListener('message', async (ev) => {
        const msg = JSON.parse(ev.data);
        if (msg.type && msg.type.startsWith('transcript')) {
                const text = msg.transcript || msg.text;
                if (text) addMessage('user', text);
        }
        if (msg.type && msg.type.startsWith('response')) {
                const text = msg.text || msg.delta;
                if (text) addMessage('assistant', text);
        }
        // Handle function calls
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

// Capture microphone
navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
	// Add microphone to PeerConnection
	stream.getTracks().forEach((track) => peerConnection.addTransceiver(track, { direction: 'sendrecv' }));

	peerConnection.createOffer().then((offer) => {
		peerConnection.setLocalDescription(offer);
		fetch('/session')
			.then((tokenResponse) => tokenResponse.json())
			.then((data) => {
				const EPHEMERAL_KEY = data.result.client_secret.value;
				const baseUrl = 'https://api.openai.com/v1/realtime';
				const model = 'gpt-4o-realtime-preview-2024-12-17';
				fetch(`${baseUrl}?model=${model}`, {
					method: 'POST',
					body: offer.sdp,
					headers: {
						Authorization: `Bearer ${EPHEMERAL_KEY}`,
						'Content-Type': 'application/sdp',
					},
				})
					.then((r) => r.text())
					.then((answer) => {
						// Accept answer from Realtime WebRTC API
						peerConnection.setRemoteDescription({
							sdp: answer,
							type: 'answer',
						});
					});
			});

		// Send WebRTC Offer to Workers Realtime WebRTC API Relay
	});
});
document.getElementById('start-voice').addEventListener('click', startVoice);
document.getElementById('stop-voice').addEventListener('click', stopVoice);
