// apps/server/src/assist/ollama.ts (owner: Dev B)
// "Ask PATCHWORK": a local model (Ollama, e.g. qwen3:4b) turns a plain-English instruction plus a list
// of page elements into a structured fix. The reply is forced into a JSON Schema; the server still
// validates everything the model returns before anything is saved.
import { AppError, ATTRIBUTE_ALLOWLIST, STYLE_ALLOWLIST } from '@patchwork/shared';
import type { Env } from '../env.js';

export interface Candidate {
  index: number;
  tag: string;
  text: string;
  id: string | null;
  classes: string[];
  href: string | null;
  role: string | null;
}

/** The model's flat answer; the server maps it to real PatchOps and VerificationSteps. */
export interface ModelDraft {
  targetIndex: number;
  summary: string;
  ops: Array<{
    kind: 'setText' | 'setAttribute' | 'removeAttribute' | 'setStyle' | 'hide' | 'show' | 'insertHTML' | 'setBehavior';
    value?: string;
    name?: string;
    property?: string;
    url?: string;
    behavior?: 'navigate' | 'preventDefault';
    position?: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
    html?: string;
  }>;
  checks: Array<{
    action: 'click' | 'expectUrl' | 'expectText' | 'expectVisible' | 'expectHidden';
    contains?: string;
  }>;
}

const OP_KINDS = ['setText', 'setAttribute', 'removeAttribute', 'setStyle', 'hide', 'show', 'insertHTML', 'setBehavior'];

const SCHEMA = {
  type: 'object',
  properties: {
    targetIndex: { type: 'integer' },
    summary: { type: 'string' },
    ops: {
      type: 'array',
      minItems: 1,
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          kind: { type: 'string', enum: OP_KINDS },
          value: { type: 'string' },
          name: { type: 'string', enum: [...ATTRIBUTE_ALLOWLIST] },
          property: { type: 'string', enum: [...STYLE_ALLOWLIST] },
          url: { type: 'string' },
          behavior: { type: 'string', enum: ['navigate', 'preventDefault'] },
          position: { type: 'string', enum: ['beforebegin', 'afterbegin', 'beforeend', 'afterend'] },
          html: { type: 'string' },
        },
        required: ['kind'],
      },
    },
    checks: {
      type: 'array',
      maxItems: 3,
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['click', 'expectUrl', 'expectText', 'expectVisible', 'expectHidden'] },
          contains: { type: 'string' },
        },
        required: ['action'],
      },
    },
  },
  required: ['targetIndex', 'summary', 'ops', 'checks'],
};

const SYSTEM = `You fix live websites without touching their code. You get a list of page elements and an instruction.
Choose the ONE element the instruction is about (targetIndex) and the smallest change that does what is asked.
Operations (all act on that element):
- setText {value}: replace its visible text.
- setAttribute {name, value} / removeAttribute {name}: change an attribute (href only works on links <a>).
- setStyle {property, value}: change one CSS property.
- hide {} / show {}: hide or show it.
- insertHTML {position, html}: add a short plain note next to it (no scripts).
- setBehavior {behavior:"navigate", url}: clicking it goes to url (works on any element, including buttons).
- setBehavior {behavior:"preventDefault"}: clicking it does nothing.
Checks prove the fix in a real browser, on the chosen element: click, expectUrl {contains}, expectText {contains},
expectVisible, expectHidden. Write a short summary in plain English, like a title (max 8 words).

Examples:
- "make the Buy button open the payment page" on [4] <button> "Buy now":
  {"targetIndex":4,"summary":"Buy button opens payment page","ops":[{"kind":"setBehavior","behavior":"navigate","url":"/pay"}],"checks":[{"action":"click"},{"action":"expectUrl","contains":"/pay"}]}
  (a <button> has no href: making it go somewhere is always setBehavior navigate)
- "remove the expired sale banner" on [2] <div> "Summer sale ends 1 June":
  {"targetIndex":2,"summary":"Hide expired sale banner","ops":[{"kind":"hide"}],"checks":[{"action":"expectHidden"}]}
- "the lamp should cost ₹999" on [7] <p> "₹99":
  {"targetIndex":7,"summary":"Fix lamp price","ops":[{"kind":"setText","value":"₹999"}],"checks":[{"action":"expectText","contains":"₹999"}]}
Navigation fixes always include a click check followed by an expectUrl check.
setBehavior with behavior "navigate" MUST include url. If the page has a link to the place the instruction names
(for example <a> "Checkout" href=/checkout), use that link's href as the url.`;

export function candidateLine(c: Candidate): string {
  const bits = [`[${c.index}] <${c.tag}>`];
  if (c.text) bits.push(`"${c.text}"`);
  if (c.id) bits.push(`#${c.id}`);
  if (c.classes.length) bits.push(`.${c.classes.join('.')}`);
  if (c.href) bits.push(`href=${c.href}`);
  if (c.role) bits.push(`role=${c.role}`);
  return bits.join(' ');
}

/** One structured call to the local model. Throws AppError with a plain message on any failure. */
export async function askModel(
  env: Env,
  instruction: string,
  candidates: Candidate[],
  previous?: { draft: unknown; failure: string },
): Promise<{ draft: ModelDraft; model: string; latencyMs: number }> {
  if (env.PW_ASSIST_PROVIDER !== 'ollama') {
    throw new AppError('INVALID_STATE', 'Ask PATCHWORK is off. Set PW_ASSIST_PROVIDER=ollama in .env and restart.');
  }
  const user = [
    `Instruction: ${instruction}`,
    'Elements on the page:',
    ...candidates.map(candidateLine),
    ...(previous
      ? [
          '',
          `Your previous draft was: ${JSON.stringify(previous.draft)}`,
          `A real browser tested it and it failed: ${previous.failure}`,
          'Return a corrected draft.',
        ]
      : []),
  ].join('\n');
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${env.PW_OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(env.PW_ASSIST_TIMEOUT_MS),
      body: JSON.stringify({
        model: env.PW_ASSIST_MODEL,
        stream: false,
        think: false,
        format: SCHEMA,
        options: { temperature: 0 },
        messages: [
          { role: 'system', content: SYSTEM },
          { role: 'user', content: user },
        ],
      }),
    });
  } catch (err) {
    const timedOut = err instanceof Error && err.name === 'TimeoutError';
    throw new AppError(
      'UPSTREAM_UNREACHABLE',
      timedOut
        ? `The local model took longer than ${Math.round(env.PW_ASSIST_TIMEOUT_MS / 1000)} s. Fix it manually, or try again.`
        : `The local model is not running (${env.PW_OLLAMA_URL}). Start Ollama, or fix it manually.`,
    );
  }
  if (!res.ok) {
    throw new AppError('UPSTREAM_UNREACHABLE', `The local model answered ${res.status}. Is ${env.PW_ASSIST_MODEL} pulled?`);
  }
  const body = (await res.json()) as { message?: { content?: string } };
  let draft: ModelDraft;
  try {
    draft = JSON.parse(body.message?.content ?? '') as ModelDraft;
  } catch {
    throw new AppError('VALIDATION_FAILED', "The model's answer was not valid JSON. Fix it manually, or try again.");
  }
  if (!Number.isInteger(draft.targetIndex) || !Array.isArray(draft.ops) || draft.ops.length === 0) {
    throw new AppError('VALIDATION_FAILED', "The model's answer did not name an element and a change. Fix it manually.");
  }
  return { draft, model: env.PW_ASSIST_MODEL, latencyMs: Date.now() - started };
}
