import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const source = readFileSync(new URL('../public/script.js', import.meta.url), 'utf8');
const deferred = () => {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const response = (body, status = 200) => new Response(JSON.stringify(body), { status });

function fixture() {
  const peers = [];
  const streams = [];
  const requests = [];
  const notices = [];
  const logs = [];
  const audio = [];
  const elements = new Map();
  function element(id = '') {
    return {
      id, disabled: id === 'stop-voice', value: id === 'voice-select' ? 'nova' : '',
      children: [], listeners: {}, textContent: '',
      addEventListener(name, fn) { this.listeners[name] = fn; },
      appendChild(child) { this.children.push(child); },
      remove() { this.removed = true; },
    };
  }
  for (const id of ['messages', 'start-voice', 'stop-voice', 'connection-status', 'voice-select', 'instructions-input']) {
    elements.set(id, element(id));
  }
  const state = {
    peers, streams, requests, notices, logs, audio, elements,
    createStream() {
      const track = { stopped: false, stop() { this.stopped = true; } };
      const stream = { getTracks: () => [track] };
      streams.push(stream);
      return stream;
    },
    microphone: () => Promise.resolve(state.createStream()),
    fetch: async (url) => url === '/tools' ? response({ tools: [] })
      : url === '/session' ? response({ result: { client_secret: { value: 'test-ephemeral' } } })
        : new Response('test SDP answer'),
  };
  class Peer {
    constructor() {
      this.closed = false;
      this.connectionState = 'new';
      this.listeners = {};
      this.channel = {
        readyState: 'open', sent: [], listeners: {},
        addEventListener(name, fn) { this.listeners[name] = fn; },
        send(value) { assert.equal(this.readyState, 'open'); this.sent.push(JSON.parse(value)); },
        close() { this.readyState = 'closed'; this.listeners.close?.(); },
      };
      peers.push(this);
    }
    createDataChannel() { return this.channel; }
    addTransceiver() { assert.equal(this.closed, false); }
    async createOffer() { return { sdp: 'test SDP offer' }; }
    async setLocalDescription() { assert.equal(this.closed, false); }
    async setRemoteDescription(answer) { assert.equal(this.closed, false); this.answer = answer; }
    addEventListener(name, fn) { this.listeners[name] = fn; }
    close() { this.closed = true; this.connectionState = 'closed'; this.onconnectionstatechange?.(); }
  }
  const context = vm.createContext({
    Hand: class {}, RTCPeerConnection: Peer, AbortController,
    navigator: { mediaDevices: { getUserMedia: (...args) => state.microphone(...args) } },
    fetch: async (...args) => { requests.push(args); return state.fetch(...args); },
    document: {
      getElementById: (id) => elements.get(id) || null,
      querySelector: () => null, addEventListener() {},
      createElement: (tag) => { const el = element(); if (tag === 'audio') audio.push(el); return el; },
      body: { appendChild() {} },
    },
    window: { M: true }, M: { toast: (notice) => notices.push(notice) },
    console: { log: (...args) => logs.push(args), error: (...args) => logs.push(args) },
  });
  vm.runInContext(source, context, { filename: 'public/script.js' });
  return Object.assign(state, { start: context.startRealtime, stop: context.stopRealtime });
}

async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
}

test('Start allows one pending attempt and Stop is usable while connecting', async () => {
  const f = fixture();
  const mic = deferred();
  f.microphone = () => mic.promise;
  const first = f.start();
  const second = f.start();
  assert.equal(f.peers.length, 1);
  assert.equal(f.elements.get('start-voice').disabled, true);
  assert.equal(f.elements.get('stop-voice').disabled, false);
  f.stop();
  mic.resolve(f.createStream());
  await Promise.all([first, second]);
  assert.equal(f.streams[0].getTracks()[0].stopped, true);
  assert.equal(f.requests.length, 0);
});

test('Stop releases microphone, remote audio, channel and peer and resets controls', async () => {
  const f = fixture();
  await f.start();
  f.peers[0].ontrack({ streams: [f.streams[0]] });
  assert.equal(f.elements.get('stop-voice').disabled, false);
  f.stop();
  assert.equal(f.peers[0].closed, true);
  assert.equal(f.peers[0].channel.readyState, 'closed');
  assert.equal(f.streams[0].getTracks()[0].stopped, true);
  assert.equal(f.audio[0].removed, true);
  assert.equal(f.audio[0].srcObject, null);
  assert.equal(f.elements.get('start-voice').disabled, false);
  assert.equal(f.elements.get('stop-voice').disabled, true);
});

test('a cancelled microphone request cannot damage a successful retry', async () => {
  const f = fixture();
  const mic = deferred();
  f.microphone = () => mic.promise;
  const oldAttempt = f.start();
  f.stop();
  f.microphone = () => Promise.resolve(f.createStream());
  await f.start();
  mic.resolve(f.createStream());
  await oldAttempt;
  assert.equal(f.peers[0].closed, true);
  assert.equal(f.peers[1].closed, false);
  assert.equal(f.streams[0].getTracks()[0].stopped, false);
  assert.equal(f.streams[1].getTracks()[0].stopped, true);
  f.stop();
});

test('Stop aborts a pending session request and ignores its late result after retry', async () => {
  const f = fixture();
  const session = deferred();
  const defaultFetch = f.fetch;
  f.fetch = (url) => url === '/session' ? session.promise : defaultFetch(url);
  const oldAttempt = f.start();
  await settle();
  const request = f.requests.find(([url]) => url === '/session');
  assert.ok(request);
  f.stop();
  assert.equal(request[1].signal.aborted, true);
  f.fetch = defaultFetch;
  await f.start();
  session.resolve(response({ result: { client_secret: { value: 'old-test-token' } } }));
  await oldAttempt;
  assert.equal(f.peers[1].closed, false);
  assert.equal(f.requests.filter(([url]) => url.startsWith('https://')).length, 1);
  f.stop();
});

for (const [name, payload, status] of [
  ['HTTP failure', { error: 'private-upstream-detail' }, 503],
  ['missing token', { result: {} }, 200],
  ['null response', null, 200],
  ['non-string token', { result: { client_secret: { value: {} } } }, 200],
]) {
  test(`${name} releases resources and allows retry without logging the payload`, async () => {
    const f = fixture();
    const defaultFetch = f.fetch;
    f.fetch = (url) => url === '/session' ? response(payload, status) : defaultFetch(url);
    await f.start();
    assert.equal(f.peers[0].closed, true);
    assert.equal(f.streams[0].getTracks()[0].stopped, true);
    assert.equal(f.elements.get('start-voice').disabled, false);
    assert.equal(f.notices.length, 1);
    assert.doesNotMatch(JSON.stringify(f.logs), /private-upstream-detail/);
    f.fetch = defaultFetch;
    await f.start();
    assert.equal(f.peers[1].closed, false);
    f.stop();
  });
}

test('microphone denial and invalid JSON both leave the controls ready for retry', async () => {
  for (const failure of ['microphone', 'json']) {
    const f = fixture();
    if (failure === 'microphone') f.microphone = async () => { throw new Error('Permission denied'); };
    else f.fetch = async () => new Response('not json');
    await f.start();
    assert.equal(f.peers[0].closed, true);
    assert.equal(f.elements.get('start-voice').disabled, false);
    assert.equal(f.notices.length, 1);
    f.stop();
  }
});

test('an SDP failure cleans up, then a fresh attempt succeeds', async () => {
  const f = fixture();
  const defaultFetch = f.fetch;
  f.fetch = (url) => url.startsWith('https://') ? response({ error: 'failed' }, 502) : defaultFetch(url);
  await f.start();
  assert.equal(f.peers[0].closed, true);
  f.fetch = defaultFetch;
  await f.start();
  assert.equal(f.peers[1].closed, false);
  f.stop();
});

test('late tool configuration from a cancelled session cannot send into a retry', async () => {
  const f = fixture();
  await f.start();
  const tools = deferred();
  const defaultFetch = f.fetch;
  f.fetch = (url) => url === '/tools' ? tools.promise : defaultFetch(url);
  const configure = f.peers[0].channel.listeners.open({});
  f.stop();
  f.fetch = defaultFetch;
  await f.start();
  tools.resolve(response({ tools: [] }));
  await configure;
  await settle();
  assert.equal(f.peers[1].channel.sent.length, 0);
  f.stop();
});

test('late tool results and remote tracks from a cancelled session are ignored', async () => {
  const f = fixture();
  await f.start();
  const tool = deferred();
  const defaultFetch = f.fetch;
  f.fetch = (url) => url === '/tools/testTool' ? tool.promise : defaultFetch(url);
  const message = f.peers[0].channel.listeners.message({ data: JSON.stringify({
    type: 'response.function_call_arguments.done', name: 'testTool', arguments: '{}', call_id: 'test-call',
  }) });
  f.stop();
  assert.equal(f.requests.find(([url]) => url === '/tools/testTool')[1].signal.aborted, true);
  f.fetch = defaultFetch;
  await f.start();
  f.peers[0].ontrack({ streams: [f.streams[0]] });
  tool.resolve(response({ result: 'test-result' }));
  await message;
  assert.equal(f.audio.length, 0);
  assert.equal(f.peers[1].channel.sent.length, 0);
  f.stop();
});

test('malformed data-channel events cannot corrupt an active session', async () => {
  const f = fixture();
  await f.start();
  for (const data of ['not JSON', 'null', '{"type":1}']) {
    await f.peers[0].channel.listeners.message({ data });
  }
  assert.equal(f.peers[0].closed, false);
  assert.equal(f.peers[0].channel.sent.length, 0);
  assert.equal(f.notices.length, 2);
  f.stop();
});

test('a failed connection or unexpected channel close releases its resources', async () => {
  for (const failure of ['peer', 'channel']) {
    const f = fixture();
    await f.start();
    if (failure === 'peer') {
      f.peers[0].connectionState = 'failed';
      f.peers[0].onconnectionstatechange();
    } else f.peers[0].channel.close();
    assert.equal(f.peers[0].closed, true);
    assert.equal(f.streams[0].getTracks()[0].stopped, true);
    assert.equal(f.elements.get('start-voice').disabled, false);
  }
});
