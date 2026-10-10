// apps/web/test/opForm.test.ts (owner: Dev D)
// The form -> PatchOp mapping for all 9 kinds, plus property keys and summaries.
import { describe, expect, it } from 'vitest';
import {
  emptyOpDraft,
  describeOp,
  opDraftToOp,
  opPropertyKey,
  OP_KINDS,
  type OpDraft,
} from '../src/editor/opForm.js';

describe('opDraftToOp', () => {
  it('maps setText with a TargetRef anchor', () => {
    const op = opDraftToOp({ kind: 'setText', anchor: 'a1', value: 'New text' });
    expect(op).toEqual({ kind: 'setText', target: { anchor: 'a1' }, value: 'New text' });
  });

  it('maps setAttribute and removeAttribute', () => {
    expect(opDraftToOp({ kind: 'setAttribute', anchor: 'a1', name: 'aria-label', value: 'Checkout' })).toEqual({
      kind: 'setAttribute',
      target: { anchor: 'a1' },
      name: 'aria-label',
      value: 'Checkout',
    });
    expect(opDraftToOp({ kind: 'removeAttribute', anchor: 'a2', name: 'disabled' })).toEqual({
      kind: 'removeAttribute',
      target: { anchor: 'a2' },
      name: 'disabled',
    });
  });

  it('maps setStyle', () => {
    expect(opDraftToOp({ kind: 'setStyle', anchor: 'a1', property: 'pointer-events', value: 'none' })).toEqual({
      kind: 'setStyle',
      target: { anchor: 'a1' },
      property: 'pointer-events',
      value: 'none',
    });
  });

  it('maps hide and show', () => {
    expect(opDraftToOp({ kind: 'hide', anchor: 'a3' })).toEqual({ kind: 'hide', target: { anchor: 'a3' } });
    expect(opDraftToOp({ kind: 'show', anchor: 'a3' })).toEqual({ kind: 'show', target: { anchor: 'a3' } });
  });

  it('maps move with a reference TargetRef and position', () => {
    expect(
      opDraftToOp({ kind: 'move', anchor: 'a1', reference: 'a2', position: 'prepend' }),
    ).toEqual({
      kind: 'move',
      target: { anchor: 'a1' },
      reference: { anchor: 'a2' },
      position: 'prepend',
    });
  });

  it('maps insertHTML', () => {
    expect(
      opDraftToOp({ kind: 'insertHTML', anchor: 'a1', position: 'afterbegin', html: '<b>hi</b>' }),
    ).toEqual({
      kind: 'insertHTML',
      target: { anchor: 'a1' },
      position: 'afterbegin',
      html: '<b>hi</b>',
    });
  });

  it('maps setBehavior with every action variant', () => {
    expect(
      opDraftToOp({
        kind: 'setBehavior',
        anchor: 'a1',
        event: 'click',
        mode: 'replace',
        action: { type: 'navigate', url: '/checkout' },
      }),
    ).toEqual({
      kind: 'setBehavior',
      target: { anchor: 'a1' },
      event: 'click',
      mode: 'replace',
      action: { type: 'navigate', url: '/checkout' },
    });

    expect(
      opDraftToOp({
        kind: 'setBehavior',
        anchor: 'a1',
        event: 'submit',
        mode: 'before',
        action: { type: 'preventDefault' },
      }),
    ).toEqual({
      kind: 'setBehavior',
      target: { anchor: 'a1' },
      event: 'submit',
      mode: 'before',
      action: { type: 'preventDefault' },
    });

    expect(
      opDraftToOp({
        kind: 'setBehavior',
        anchor: 'a1',
        event: 'click',
        mode: 'replace',
        action: { type: 'clickTarget', target: 'a2' },
      }),
    ).toEqual({
      kind: 'setBehavior',
      target: { anchor: 'a1' },
      event: 'click',
      mode: 'replace',
      action: { type: 'clickTarget', target: { anchor: 'a2' } },
    });

    expect(
      opDraftToOp({
        kind: 'setBehavior',
        anchor: 'a1',
        event: 'click',
        mode: 'replace',
        action: { type: 'toggleAttribute', target: 'a2', name: 'aria-disabled' },
      }),
    ).toEqual({
      kind: 'setBehavior',
      target: { anchor: 'a1' },
      event: 'click',
      mode: 'replace',
      action: { type: 'toggleAttribute', target: { anchor: 'a2' }, name: 'aria-disabled' },
    });

    expect(
      opDraftToOp({
        kind: 'setBehavior',
        anchor: 'a1',
        event: 'submit',
        mode: 'replace',
        action: { type: 'submitForm', target: 'a2' },
      }),
    ).toEqual({
      kind: 'setBehavior',
      target: { anchor: 'a1' },
      event: 'submit',
      mode: 'replace',
      action: { type: 'submitForm', target: { anchor: 'a2' } },
    });
  });

  it('rejects malformed anchor keys instead of writing a broken patch', () => {
    const bad = { kind: 'setText', anchor: 'Not A Key!', value: 'x' } as unknown as OpDraft;
    expect(() => opDraftToOp(bad)).toThrow(/Anchor key/);
    const badTarget = {
      kind: 'setBehavior',
      anchor: 'a1',
      event: 'click',
      mode: 'replace',
      action: { type: 'clickTarget', target: 'ALSO BAD' },
    } as unknown as OpDraft;
    expect(() => opDraftToOp(badTarget)).toThrow(/Anchor key/);
  });

  it('round-trips every kind through emptyOpDraft -> opDraftToOp', () => {
    for (const kind of OP_KINDS) {
      const draft = emptyOpDraft(kind, ['a1', 'a2']);
      const op = opDraftToOp(draft);
      expect(op.kind).toBe(kind);
    }
  });

  it('derives the conflict property keys of PLAN 11.3', () => {
    expect(opPropertyKey(opDraftToOp({ kind: 'setText', anchor: 'a1', value: 'v' }))).toBe('text');
    expect(opPropertyKey(opDraftToOp({ kind: 'setStyle', anchor: 'a1', property: 'color', value: 'red' }))).toBe('style:color');
    expect(opPropertyKey(opDraftToOp({ kind: 'hide', anchor: 'a1' }))).toBe('visibility');
    expect(opPropertyKey(opDraftToOp({ kind: 'move', anchor: 'a1', reference: 'a2', position: 'after' }))).toBe('position');
    expect(opPropertyKey(opDraftToOp({ kind: 'insertHTML', anchor: 'a1', position: 'beforeend', html: 'x' }))).toBe('insert:beforeend');
    expect(
      opPropertyKey(opDraftToOp({ kind: 'setBehavior', anchor: 'a1', event: 'click', mode: 'replace', action: { type: 'preventDefault' } })),
    ).toBe('behavior:click');
  });

  it('summarises ops in plain language', () => {
    expect(describeOp({ kind: 'setText', anchor: 'a1', value: '₹1,299' })).toBe('set text of a1 to “₹1,299”');
    expect(describeOp({ kind: 'hide', anchor: 'promo' })).toBe('hide promo');
    expect(describeOp({ kind: 'move', anchor: 'a1', reference: 'a2', position: 'after' })).toBe('move a1 after a2');
    expect(
      describeOp({ kind: 'setBehavior', anchor: 'a1', event: 'click', mode: 'replace', action: { type: 'navigate', url: '/checkout' } }),
    ).toBe('on click (replace): go to /checkout');
  });
});
