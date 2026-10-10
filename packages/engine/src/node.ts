// OWNER: Dev B - replace this stub (docs/PLAN.md sections 11.14, 13.4)
// Node-only entry of the engine (jsdom). Never imported by packages/runtime.
import { AppError } from '@patchwork/shared';

const stub = (fn: string): never => {
  throw new AppError('NOT_IMPLEMENTED', `engine.node.${fn} is a scaffold stub (owner: Dev B)`);
};

export function documentFromHtml(_html: string, _url: string): { document: Document; window: Window } {
  return stub('documentFromHtml');
}
