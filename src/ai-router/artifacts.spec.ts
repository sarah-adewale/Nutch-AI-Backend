import {
  extensionForLanguage,
  extractArtifacts,
  slugForPrompt,
} from './artifacts';

describe('extensionForLanguage', () => {
  it('maps common fence languages to extensions', () => {
    expect(extensionForLanguage('typescript')).toBe('ts');
    expect(extensionForLanguage('Python')).toBe('py');
    expect(extensionForLanguage('bash')).toBe('sh');
  });

  it('falls back to txt for an unlabelled fence', () => {
    expect(extensionForLanguage('')).toBe('txt');
    expect(extensionForLanguage('   ')).toBe('txt');
  });

  it('keeps an unknown language as its own extension', () => {
    expect(extensionForLanguage('elixir')).toBe('elixir');
  });
});

describe('extractArtifacts', () => {
  it('returns nothing for a prose-only answer', () => {
    expect(extractArtifacts('Here is an explanation with no code.')).toEqual(
      [],
    );
  });

  it('extracts a single fenced block with its language', () => {
    const response = [
      'Sure, here you go:',
      '```typescript',
      'export function add(a: number, b: number) { return a + b; }',
      '```',
    ].join('\n');

    expect(extractArtifacts(response)).toEqual([
      {
        filename: 'output-1.ts',
        content: 'export function add(a: number, b: number) { return a + b; }',
        fileType: 'ts',
      },
    ]);
  });

  it('numbers multiple blocks in order', () => {
    const response =
      '```py\nprint("a nice long first block")\n```\ntext\n```sql\nSELECT * FROM a_table_name;\n```';

    const names = extractArtifacts(response).map((a) => a.filename);
    expect(names).toEqual(['output-1.py', 'output-2.sql']);
  });

  it('skips a block too short to be worth saving', () => {
    expect(extractArtifacts('```js\nx=1\n```')).toEqual([]);
  });

  it('uses the supplied name prefix', () => {
    const response = '```js\nconsole.log("hello world from nutch");\n```';
    expect(extractArtifacts(response, 'fib')[0].filename).toBe('fib-1.js');
  });

  it('is not confused by leftover regex state across calls', () => {
    const response = '```js\nconsole.log("hello world from nutch");\n```';
    expect(extractArtifacts(response)).toHaveLength(1);
    expect(extractArtifacts(response)).toHaveLength(1);
  });

  it('handles CRLF line endings', () => {
    const response = '```js\r\nconsole.log("hello world from nutch");\r\n```';
    expect(extractArtifacts(response)).toHaveLength(1);
  });
});

describe('slugForPrompt', () => {
  it('slugifies a prompt', () => {
    expect(slugForPrompt('Write a Fibonacci function!')).toBe(
      'write-a-fibonacci-function',
    );
  });

  it('truncates without leaving a trailing dash', () => {
    expect(slugForPrompt('a '.repeat(60)).endsWith('-')).toBe(false);
  });

  it('falls back when the prompt has no usable characters', () => {
    expect(slugForPrompt('!!!')).toBe('output');
  });
});
