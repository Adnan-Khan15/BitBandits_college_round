// packages/engine/src/node.ts
// Node-only entry of the engine (jsdom). Never imported by packages/runtime (PLAN 11.14, 11.17).
import { JSDOM } from 'jsdom';

export function documentFromHtml(html: string, url: string): { document: Document; window: Window } {
  const dom = new JSDOM(html, { url, runScripts: undefined, pretendToBeVisual: false });
  return { document: dom.window.document, window: dom.window as unknown as Window };
}
