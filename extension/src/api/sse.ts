/**
 * Parser for the server-sent event stream returned by POST /ai/prompt/stream.
 *
 * `EventSource` cannot be used: it only issues GET requests and cannot send an
 * Authorization header, so the stream is read from a fetch body instead. That
 * means framing has to be handled here.
 *
 * Chunks arrive on arbitrary boundaries, so a frame can be split across reads
 * and several frames can arrive in one. The buffer below exists for exactly
 * that; parsing chunk-by-chunk drops events under load.
 */

export interface SseFrame {
  event: string;
  data: string;
}

const FRAME_SEPARATOR = /\r?\n\r?\n/;

export class SseParser {
  private buffer = '';

  /** Feeds a chunk and returns whatever complete frames it completed. */
  push(chunk: string): SseFrame[] {
    this.buffer += chunk;
    const frames: SseFrame[] = [];

    let match = FRAME_SEPARATOR.exec(this.buffer);
    while (match) {
      const raw = this.buffer.slice(0, match.index);
      this.buffer = this.buffer.slice(match.index + match[0].length);

      const frame = parseFrame(raw);
      if (frame) frames.push(frame);

      match = FRAME_SEPARATOR.exec(this.buffer);
    }

    return frames;
  }

  /** Anything left when the stream closes without a trailing blank line. */
  flush(): SseFrame[] {
    const raw = this.buffer.trim();
    this.buffer = '';
    if (!raw) return [];
    const frame = parseFrame(raw);
    return frame ? [frame] : [];
  }
}

function parseFrame(raw: string): SseFrame | undefined {
  let event = 'message';
  const data: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    if (line.startsWith(':')) continue; // comment / keep-alive
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      // Exactly one leading space is part of the framing, not the payload.
      data.push(line.slice(5).replace(/^ /, ''));
    }
  }

  if (data.length === 0) return undefined;
  return { event, data: data.join('\n') };
}
