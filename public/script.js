const hand = new Hand();
const messagesContainer = document.getElementById('messages');
const speakBtn = document.getElementById('speak-btn');
const voiceNameInput = document.getElementById('voice-name');
const voiceInstructionsInput = document.getElementById('voice-instructions');
const speechTextInput = document.getElementById('speech-text');
const realtimeBtn = document.getElementById('realtime-toggle');
const realtimeIcon = document.getElementById('realtime-icon');
let realtimeActive = false;

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

function toggleRealtime() {
        if (realtimeActive) {
                peerConnection.close();
                realtimeActive = false;
                realtimeBtn.classList.add('pulse');
                realtimeIcon.textContent = 'play_arrow';
        } else {
                startRealtime();
                realtimeActive = true;
                realtimeBtn.classList.remove('pulse');
                realtimeIcon.textContent = 'stop';
        }
}

function startRealtime() {
        talkToTheHand();
        navigator.mediaDevices.getUserMedia({ audio: true }).then((stream) => {
                stream.getTracks().forEach((track) =>
                        peerConnection.addTransceiver(track, { direction: 'sendrecv' }),
                );

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
                                                        peerConnection.setRemoteDescription({
                                                                sdp: answer,
                                                                type: 'answer',
                                                        });
                                                });
                                });
                });
        });
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
        return data.tools || [];
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

speakBtn.addEventListener('click', async () => {
        const voice = voiceNameInput.value;
        const instructions = voiceInstructionsInput.value;
        const text = speechTextInput.value;
        const response = await fetch('/speech', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text, voice, instructions }),
        });
        const buffer = await response.arrayBuffer();
        const blob = new Blob([buffer], { type: 'audio/mpeg' });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
});

realtimeBtn.addEventListener('click', toggleRealtime);

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
