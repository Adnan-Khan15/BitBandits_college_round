// apps/web/src/editor/opForm.ts (owner: Dev D)
// The form model for authoring patch ops, and the single mapping from it to the
// frozen PatchOp contract (PLAN 11.3). Forms hold plain strings for anchors and
// actions; this module is the one place that builds TargetRefs and validates
// against the allowlists — which is also why it is fully unit-tested.
import type {
  AttributeName,
  BehaviorAction,
  PatchOp,
  StyleProperty,
  VerificationStep,
} from '@patchwork/shared';
import { ANCHOR_KEY_PATTERN } from '@patchwork/shared';

export const OP_KINDS = [
  'setText',
  'setAttribute',
  'removeAttribute',
  'setStyle',
  'hide',
  'show',
  'move',
  'insertHTML',
  'setBehavior',
] as const;

export type OpKind = (typeof OP_KINDS)[number];

export type ActionDraft =
  | { type: 'navigate'; url: string }
  | { type: 'preventDefault' }
  | { type: 'clickTarget'; target: string }
  | { type: 'toggleAttribute'; target: string; name: AttributeName }
  | { type: 'submitForm'; target: string };

export type OpDraft =
  | { kind: 'setText'; anchor: string; value: string }
  | { kind: 'setAttribute'; anchor: string; name: AttributeName; value: string }
  | { kind: 'removeAttribute'; anchor: string; name: AttributeName }
  | { kind: 'setStyle'; anchor: string; property: StyleProperty; value: string }
  | { kind: 'hide'; anchor: string }
  | { kind: 'show'; anchor: string }
  | { kind: 'move'; anchor: string; reference: string; position: 'before' | 'after' | 'prepend' | 'append' }
  | {
      kind: 'insertHTML';
      anchor: string;
      position: 'beforebegin' | 'afterbegin' | 'beforeend' | 'afterend';
      html: string;
    }
  | {
      kind: 'setBehavior';
      anchor: string;
      event: 'click' | 'submit';
      mode: 'replace' | 'before';
      action: ActionDraft;
    };

export const MOVE_POSITIONS = ['before', 'after', 'prepend', 'append'] as const;
export const INSERT_POSITIONS = ['beforebegin', 'afterbegin', 'beforeend', 'afterend'] as const;

export function emptyOpDraft(kind: OpKind, anchorKeys: string[]): OpDraft {
  const anchor = anchorKeys[0] ?? '';
  switch (kind) {
    case 'setText':
      return { kind, anchor, value: '' };
    case 'setAttribute':
      return { kind, anchor, name: 'title', value: '' };
    case 'removeAttribute':
      return { kind, anchor, name: 'title' };
    case 'setStyle':
      return { kind, anchor, property: 'color', value: '' };
    case 'hide':
    case 'show':
      return { kind, anchor };
    case 'move':
      return { kind, anchor, reference: anchorKeys[1] ?? '', position: 'after' };
    case 'insertHTML':
      return { kind, anchor, position: 'beforeend', html: '' };
    case 'setBehavior':
      return { kind, anchor, event: 'click', mode: 'replace', action: { type: 'navigate', url: '' } };
  }
}

function requireAnchorKey(key: string): string {
  if (!ANCHOR_KEY_PATTERN.test(key)) {
    throw new Error(`Anchor key "${key}" is not valid; expected /^[a-z0-9_-]{1,32}$/`);
  }
  return key;
}

function actionToContract(action: ActionDraft): BehaviorAction {
  switch (action.type) {
    case 'navigate':
      return { type: 'navigate', url: action.url };
    case 'preventDefault':
      return { type: 'preventDefault' };
    case 'clickTarget':
      return { type: 'clickTarget', target: { anchor: requireAnchorKey(action.target) } };
    case 'toggleAttribute':
      return { type: 'toggleAttribute', target: { anchor: requireAnchorKey(action.target) }, name: action.name };
    case 'submitForm':
      return { type: 'submitForm', target: { anchor: requireAnchorKey(action.target) } };
  }
}

/** The single form -> contract mapping, covered by unit tests for all 9 kinds. */
export function opDraftToOp(draft: OpDraft): PatchOp {
  switch (draft.kind) {
    case 'setText':
      return { kind: 'setText', target: { anchor: requireAnchorKey(draft.anchor) }, value: draft.value };
    case 'setAttribute':
      return {
        kind: 'setAttribute',
        target: { anchor: requireAnchorKey(draft.anchor) },
        name: draft.name,
        value: draft.value,
      };
    case 'removeAttribute':
      return { kind: 'removeAttribute', target: { anchor: requireAnchorKey(draft.anchor) }, name: draft.name };
    case 'setStyle':
      return {
        kind: 'setStyle',
        target: { anchor: requireAnchorKey(draft.anchor) },
        property: draft.property,
        value: draft.value,
      };
    case 'hide':
      return { kind: 'hide', target: { anchor: requireAnchorKey(draft.anchor) } };
    case 'show':
      return { kind: 'show', target: { anchor: requireAnchorKey(draft.anchor) } };
    case 'move':
      return {
        kind: 'move',
        target: { anchor: requireAnchorKey(draft.anchor) },
        reference: { anchor: requireAnchorKey(draft.reference) },
        position: draft.position,
      };
    case 'insertHTML':
      return {
        kind: 'insertHTML',
        target: { anchor: requireAnchorKey(draft.anchor) },
        position: draft.position,
        html: draft.html,
      };
    case 'setBehavior':
      return {
        kind: 'setBehavior',
        target: { anchor: requireAnchorKey(draft.anchor) },
        event: draft.event,
        mode: draft.mode,
        action: actionToContract(draft.action),
      };
  }
}

/** One-line summary for the ops table (plain language, no contract jargon). */
export function describeOp(draft: OpDraft): string {
  switch (draft.kind) {
    case 'setText':
      return `set text of ${draft.anchor} to “${draft.value || '…'}”`;
    case 'setAttribute':
      return `set ${draft.name} of ${draft.anchor} to “${draft.value || '…'}”`;
    case 'removeAttribute':
      return `remove ${draft.name} from ${draft.anchor}`;
    case 'setStyle':
      return `set ${draft.property} of ${draft.anchor} to ${draft.value || '…'}`;
    case 'hide':
      return `hide ${draft.anchor}`;
    case 'show':
      return `show ${draft.anchor}`;
    case 'move':
      return `move ${draft.anchor} ${draft.position} ${draft.reference}`;
    case 'insertHTML':
      return `insert HTML ${draft.position} ${draft.anchor}`;
    case 'setBehavior':
      return `on ${draft.event} (${draft.mode}): ${describeAction(draft.action)}`;
  }
}

function describeAction(action: ActionDraft): string {
  switch (action.type) {
    case 'navigate':
      return `go to ${action.url || '…'}`;
    case 'preventDefault':
      return 'prevent default';
    case 'clickTarget':
      return `click ${action.target}`;
    case 'toggleAttribute':
      return `toggle ${action.name} on ${action.target}`;
    case 'submitForm':
      return `submit the form of ${action.target}`;
  }
}

/** Conflict property keys (PLAN 11.3) — used by the review screen's op table. */
export function opPropertyKey(op: PatchOp): string {
  switch (op.kind) {
    case 'setText':
      return 'text';
    case 'setAttribute':
    case 'removeAttribute':
      return `attr:${op.name}`;
    case 'setStyle':
      return `style:${op.property}`;
    case 'hide':
    case 'show':
      return 'visibility';
    case 'move':
      return 'position';
    case 'insertHTML':
      return `insert:${op.position}`;
    case 'setBehavior':
      return `behavior:${op.event}`;
  }
}

export function emptyCheck(): VerificationStep {
  return { action: 'expectText', target: '', contains: '' };
}
