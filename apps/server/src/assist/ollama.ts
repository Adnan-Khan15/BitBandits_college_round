// apps/server/src/assist/ollama.ts (owner: Dev B)
// "Ask PATCHWORK": a local model (Ollama, e.g. qwen3:4b) turns a plain-English instruction plus a list
// of page elements into a structured fix. The reply is forced into a JSON Schema; the server then
// grounds every change against the real page (the model must quote each element's current text),
// does any arithmetic itself, and validates everything before anything is saved.
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
  /** Where it sits, e.g. the product card or table row it belongs to. */
  context: string | null;
}

export const MODEL_KINDS = [
  'setText',
  'scaleNumber',
  'navigate',
  'blockClick',
  'hide',
  'show',
  'setStyle',
  'setAttribute',
  'removeAttribute',
  'insertHTML',
] as const;

/** The model's flat answer; the server maps it to real PatchOps and VerificationSteps. */
export interface ModelDraft {
  summary: string;
  ops: Array<{
    target: number;
    currentText?: string;
    kind: (typeof MODEL_KINDS)[number];
    value?: string;
    factor?: number;
    url?: string;
    name?: string;
    property?: string;
    position?: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
    html?: string;
  }>;
  checks?: Array<{ action: 'click' | 'expectUrl' | 'expectText' | 'expectVisible' | 'expectHidden'; target?: number; contains?: string }>;
}

const SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    ops: {
      type: 'array',
      minItems: 1,
      maxItems: 20,
      items: {
        type: 'object',
        properties: {
          target: { type: 'integer' },
          currentText: { type: 'string' },
          kind: { type: 'string', enum: [...MODEL_KINDS] },
          value: { type: 'string' },
          factor: { type: 'number' },
          url: { type: 'string' },
          name: { type: 'string', enum: [...ATTRIBUTE_ALLOWLIST] },
          property: { type: 'string', enum: [...STYLE_ALLOWLIST] },
          position: { type: 'string', enum: ['beforebegin', 'afterbegin', 'beforeend', 'afterend'] },
          html: { type: 'string' },
        },
        required: ['target', 'currentText', 'kind'],
      },
    },
    checks: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        properties: {
          action: { type: 'string', enum: ['click', 'expectUrl', 'expectText', 'expectVisible', 'expectHidden'] },
          target: { type: 'integer' },
          contains: { type: 'string' },
        },
        required: ['action'],
      },
    },
  },
  required: ['summary', 'ops'],
};

const SYSTEM = `You fix live websites without touching their code. You get a numbered list of page elements and an instruction.
Change ONLY the elements the instruction is about. One op per element changed; use as many ops as needed
(for "all prices", one op for EVERY price element in the list). Each op names its element by "target" (the [number])
and repeats that element's text exactly as listed in "currentText" (copy it character for character).
Kinds of op:
- setText {value}: replace the element's visible text.
- scaleNumber {factor}: multiply the number shown in the element. "10% cheaper" or "reduce by 10%" = factor 0.9,
  "20% more" = factor 1.2. NEVER compute the new number yourself: always use scaleNumber for percentage changes.
- navigate {url}: clicking the element goes to url (works on buttons; a <button> has no href). Use the href of a
  matching link on the page as the url when there is one.
- blockClick {}: clicking it does nothing.
- hide {} / show {}: hide or show it.
- setStyle {property, value}: change one CSS property.
- setAttribute {name, value} / removeAttribute {name}: change an attribute (href only works on <a>).
- insertHTML {position, html}: add a short plain note next to it (no scripts).
Pick elements by what they ARE (a price, a button, a banner), using their text and context, never a logo or menu
link unless the instruction names it. checks (optional) prove a navigation: {"action":"click","target":N} then
{"action":"expectUrl","contains":"/path"}. summary: a plain-English title, max 8 words.

Examples:
1) "make the Buy button open the payment page"; elements: [4] <button> "Buy now"; [9] <a> "Payment" href=/pay
{"summary":"Buy button opens payment page","ops":[{"target":4,"currentText":"Buy now","kind":"navigate","url":"/pay"}],"checks":[{"action":"click","target":4},{"action":"expectUrl","contains":"/pay"}]}
2) "make every price 10% cheaper"; elements: [1] <a> "Lamp Co"; [3] <p> "₹999" (in "Desk lamp"); [6] <p> "₹1,450" (in "Floor lamp")
{"summary":"All prices 10% cheaper","ops":[{"target":3,"currentText":"₹999","kind":"scaleNumber","factor":0.9},{"target":6,"currentText":"₹1,450","kind":"scaleNumber","factor":0.9}]}
3) "remove the expired sale banner"; elements: [2] <div> "Summer sale ends 1 June"
{"summary":"Hide expired sale banner","ops":[{"target":2,"currentText":"Summer sale ends 1 June","kind":"hide"}]}`;

export function candidateLine(c: Candidate): string {
  const bits = [`[${c.index}] <${c.tag}>`];
  if (c.text) bits.push(`"${c.text}"`);
  if (c.context) bits.push(`(in "${c.context}")`);
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
    throw new AppError('INVALID_STATE', 'Ask PATCHWORK is off. Start it with the patchwork command (it starts Ollama).');
  }
  const user = [
    `Instruction: ${instruction}`,
    'Elements on the page:',
    ...candidates.map(candidateLine),
    ...(previous
      ? [
          '',
          `Your previous answer was: ${JSON.stringify(previous.draft)}`,
          `It was rejected or failed in a real browser: ${previous.failure}`,
          'Return a corrected answer.',
        ]
      : []),
  ].join('\n');
  const started = Date.now();
  let res: Response;
  try {
    res = await fetch(`${env.PW_OLLAMA_URL}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      signal: AbortSignal.timeout(Math.max(env.PW_ASSIST_TIMEOUT_MS, 45_000)),
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
        ? 'The local model took too long. Fix it manually, or try a shorter instruction.'
        : `The local model is not running (${env.PW_OLLAMA_URL}). Start PATCHWORK with the patchwork command, or fix it manually.`,
    );
  }
  if (!res.ok) {
    throw new AppError('UPSTREAM_UNREACHABLE', `The local model answered ${res.status}. Is ${env.PW_ASSIST_MODEL} downloaded?`);
  }
  const body = (await res.json()) as { message?: { content?: string } };
  let draft: ModelDraft;
  try {
    draft = JSON.parse(body.message?.content ?? '') as ModelDraft;
  } catch {
    throw new AppError('VALIDATION_FAILED', "The model's answer was not valid JSON. Fix it manually, or try again.");
  }
  if (!Array.isArray(draft.ops) || draft.ops.length === 0) {
    throw new AppError('VALIDATION_FAILED', "The model's answer did not name any change. Fix it manually, or rephrase.");
  }
  return { draft, model: env.PW_ASSIST_MODEL, latencyMs: Date.now() - started };
}
