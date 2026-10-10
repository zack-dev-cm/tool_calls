# Realtime cancellation and retry

The frontend owns one connection attempt at a time. Start is disabled while the attempt is pending or active, and Stop remains available during microphone access and session setup. Stopping aborts pending HTTP requests, closes the data channel and peer, stops acquired microphone tracks, removes remote audio elements and restores Start.

Each asynchronous callback retains its originating attempt. A microphone result arriving after Stop is immediately released. Late token, tool and data-channel results cannot configure or send into a subsequent attempt. Failed setup shows one actionable notification without logging the response payload or ephemeral token.

## Verification

Run the isolated frontend regressions with `npm run test:realtime`. The tests execute the actual `public/script.js` using simulated DOM, microphone, fetch and WebRTC interfaces. They cover repeated Start, Stop during microphone and token acquisition, retry, late results, invalid responses, SDP failure, remote audio cleanup and unexpected connection failure. They do not call OpenAI, access the microphone or control Bluetooth hardware.

Run the Worker checks with `npm test -- --run` and the type check with `npx tsc --noEmit`. The authorized-session regression uses a deterministic provider response and checks the expected credential envelope. A non-401 status alone cannot pass that assertion.

## Open release gates

This is a lifecycle correction for the existing beta protocol. Both backends still create credentials through `/v1/realtime/sessions`, and the browser still connects through `/v1/realtime`. The configured preview models and beta session/event shapes are unchanged. The [official Realtime migration guidance](https://developers.openai.com/api/docs/guides/realtime#beta-to-ga-migration) specifies `client_secrets`, `calls` and GA session/event shapes. Migrating those together is a separate compatibility task that must precede a new live voice release.

Dependency audit findings also remain open. Passing these fixture regressions does not qualify the dependencies, configured authentication, deployed backend, real provider exchange, audio conversation, MCP service or robot hand. Complete those checks in the intended environment before deployment.

## Older owned proposals

The current main history already includes Materialize layout in `21df781`, realtime HTTP error handling in `67ec6f7`, and the missing-token guard and `ash` voice option in `a9d40a9` and `923c9b9`. Proposals #4, #16, #35 and #38 cover superseded versions of that work. This correction addresses the remaining cancellation and retry races on current main.

Proposal #10 includes separate speech controls and a `/speech` contract that differs from main's `/api/generate-speech` route. Keep that proposal separate until its intended UI and backend behavior are reviewed. No speech feature is considered delivered by this lifecycle correction.
