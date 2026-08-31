import { describe, expect, it } from 'vitest';
import { SseParser } from './sse';

const frame = (event: string, data: unknown) =>
  `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

describe('SseParser', () => {
  it('parses a complete frame', () => {
    const parser = new SseParser();

    expect(parser.push(frame('delta', { text: 'hi' }))).toEqual([
      { event: 'delta', data: '{"text":"hi"}' },
    ]);
  });

  it('parses several frames arriving in one chunk', () => {
    const parser = new SseParser();

    const frames = parser.push(
      frame('session', { session_id: 's1' }) + frame('delta', { text: 'a' }),
    );

    expect(frames.map((f) => f.event)).toEqual(['session', 'delta']);
  });

  it('reassembles a frame split across chunks', () => {
    // The decisive case: chunk boundaries are arbitrary, so parsing per chunk
    // silently drops events under load.
    const parser = new SseParser();
    const whole = frame('delta', { text: 'hello' });

    expect(parser.push(whole.slice(0, 12))).toEqual([]);
    expect(parser.push(whole.slice(12))).toEqual([
      { event: 'delta', data: '{"text":"hello"}' },
    ]);
  });

  it('handles a split in the middle of the blank-line separator', () => {
    const parser = new SseParser();

    expect(parser.push('event: done\ndata: {}\n')).toEqual([]);
    expect(parser.push('\n')).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('accepts CRLF line endings', () => {
    const parser = new SseParser();

    expect(parser.push('event: done\r\ndata: {}\r\n\r\n')).toEqual([
      { event: 'done', data: '{}' },
    ]);
  });

  it('ignores keep-alive comments', () => {
    const parser = new SseParser();

    expect(parser.push(': keep-alive\n\n')).toEqual([]);
    expect(parser.push(frame('done', {}))).toHaveLength(1);
  });

  it('joins multi-line data fields', () => {
    const parser = new SseParser();

    expect(parser.push('event: x\ndata: one\ndata: two\n\n')).toEqual([
      { event: 'x', data: 'one\ntwo' },
    ]);
  });

  it('strips exactly one leading space, which is framing not payload', () => {
    const parser = new SseParser();

    expect(parser.push('event: x\ndata:  padded\n\n')[0].data).toBe(' padded');
  });

  it('defaults to the message event when none is named', () => {
    const parser = new SseParser();

    expect(parser.push('data: {}\n\n')[0].event).toBe('message');
  });

  it('returns a trailing frame that never got its blank line', () => {
    const parser = new SseParser();
    parser.push('event: done\ndata: {}');

    expect(parser.flush()).toEqual([{ event: 'done', data: '{}' }]);
  });

  it('flushes nothing when the buffer is empty', () => {
    expect(new SseParser().flush()).toEqual([]);
  });

  it('does not re-emit frames already returned', () => {
    const parser = new SseParser();
    parser.push(frame('delta', { text: 'a' }));

    expect(parser.flush()).toEqual([]);
  });
});
