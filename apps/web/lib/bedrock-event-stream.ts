import "server-only";

import { EventStreamCodec } from "@smithy/eventstream-codec";
import { fromUtf8, toUtf8 } from "@smithy/util-utf8";

export type BedrockStreamEvent = {
  messageType: string;
  eventType: string;
  data: string;
};

export function decodeBedrockEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: BedrockStreamEvent) => void | Promise<void>
): ReadableStream<void> {
  const codec = new EventStreamCodec(toUtf8, fromUtf8);
  let buffer = new Uint8Array(0);
  const textDecoder = new TextDecoder();

  return body.pipeThrough(
    new TransformStream<Uint8Array, void>({
      async transform(chunk, controller) {
        const newBuffer = new Uint8Array(buffer.length + chunk.length);
        newBuffer.set(buffer);
        newBuffer.set(chunk, buffer.length);
        buffer = newBuffer;

        while (buffer.length >= 4) {
          const totalLength = new DataView(
            buffer.buffer,
            buffer.byteOffset,
            buffer.byteLength
          ).getUint32(0, false);

          if (buffer.length < totalLength) {
            break;
          }

          try {
            const subView = buffer.subarray(0, totalLength);
            const decoded = codec.decode(subView);
            buffer = buffer.slice(totalLength);

            const messageType = decoded.headers[":message-type"]?.value as string;
            const eventType = decoded.headers[":event-type"]?.value as string;
            const data = textDecoder.decode(decoded.body);

            await onEvent({ messageType, eventType, data });
          } catch {
            break;
          }
        }

        controller.enqueue();
      }
    })
  );
}

export async function collectBedrockStreamEvents(
  body: ReadableStream<Uint8Array>
): Promise<BedrockStreamEvent[]> {
  const events: BedrockStreamEvent[] = [];
  const reader = decodeBedrockEventStream(body, async (event) => {
    events.push(event);
  }).getReader();

  while (true) {
    const { done } = await reader.read();
    if (done) break;
  }

  return events;
}
