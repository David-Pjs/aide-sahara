import "dotenv/config";

const key = process.env.SAHARA_API_KEY!;
const url = `wss://infer.voice.intron.io/tts/v1/stream?voice_accent=yoruba&voice_gender=female&voice_language=en&output_audio_format=wav`;

const start = Date.now();
const ws = new WebSocket(url, { headers: { Authorization: `Bearer ${key}` } } as any);

function log(...args: unknown[]) {
  console.log(`[${((Date.now() - start) / 1000).toFixed(1)}s]`, ...args);
}

ws.addEventListener("open", () => log("WS open"));

ws.addEventListener("message", (ev: MessageEvent) => {
  const msg = JSON.parse(ev.data.toString());
  if (msg.message_type === "FETCH_AUDIO_CHUNK") {
    log("FETCH_AUDIO_CHUNK", msg.processing_staus ?? msg.processing_status, "audio bytes:", msg.audio_base_64?.length ?? 0);
    if ((msg.processing_staus ?? msg.processing_status) === "READY") {
      ws.send(JSON.stringify({ message_type: "COMMIT" }));
    } else {
      setTimeout(() => ws.send(JSON.stringify({ message_type: "FETCH_AUDIO_CHUNK", chunk_id: 1 })), 1000);
    }
    return;
  }
  log(msg.message_type, JSON.stringify(msg).slice(0, 200));
  if (msg.message_type === "SESSION_CREATED") {
    ws.send(JSON.stringify({ message_type: "INPUT_TEXT_CHUNK", text: "Hello, this is a test.", ack_id: 1 }));
  }
  if (msg.message_type === "TEXT_CHUNK_ACK") {
    setTimeout(() => ws.send(JSON.stringify({ message_type: "FETCH_AUDIO_CHUNK", chunk_id: 1 })), 500);
  }
  if (msg.message_type === "COMMITTED_AUDIO") {
    log("DONE");
    ws.close();
    process.exit(0);
  }
});

ws.addEventListener("error", (ev: any) => log("WS error", ev.message ?? ev));
ws.addEventListener("close", (ev: any) => log("WS closed", ev.code, ev.reason));

setTimeout(() => {
  log("TIMEOUT after 60s");
  process.exit(1);
}, 60_000);
