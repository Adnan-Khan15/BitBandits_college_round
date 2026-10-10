// packages/shared/src/constants.ts (owner: Dev A)
// Contract: docs/PLAN.md sections 11.2, 11.3 and 13.3 (step "CONTRACTS").

export const STYLE_ALLOWLIST = [
  'color',
  'background-color',
  'background-image',
  'font-size',
  'font-weight',
  'font-style',
  'text-decoration',
  'text-align',
  'line-height',
  'letter-spacing',
  'display',
  'visibility',
  'opacity',
  'width',
  'max-width',
  'min-width',
  'height',
  'max-height',
  'min-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'border',
  'border-color',
  'border-width',
  'border-radius',
  'gap',
  'flex-direction',
  'justify-content',
  'align-items',
  'order',
  'position',
  'top',
  'right',
  'bottom',
  'left',
  'z-index',
  'cursor',
  'pointer-events',
] as const;

export const ATTRIBUTE_ALLOWLIST = [
  'href',
  'src',
  'alt',
  'title',
  'aria-label',
  'aria-hidden',
  'aria-disabled',
  'disabled',
  'placeholder',
  'type',
  'value',
  'target',
  'rel',
  'role',
  'tabindex',
  'hidden',
  'name',
] as const;

export const DEFAULT_THRESHOLDS = { exact: 0.9, relocate: 0.65, margin: 0.15 } as const;

// The display/size/margin/padding/position subset of STYLE_ALLOWLIST.
// A patch set containing a setStyle op on one of these is "layoutChanging" (PLAN 11.7).
export const LAYOUT_STYLE_PROPS = [
  'display',
  'width',
  'max-width',
  'min-width',
  'height',
  'max-height',
  'min-height',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'position',
  'top',
  'right',
  'bottom',
  'left',
] as const;

// Ops that change layout by themselves (PLAN 11.7 verification outcome rules).
export const LAYOUT_CHANGING_OPS = ['hide', 'show', 'move', 'insertHTML'] as const;

// Anchor key shape (PLAN 11.3): keys of PatchBody.anchors.
export const ANCHOR_KEY_PATTERN = /^[a-z0-9_-]{1,32}$/;

// Limits (PLAN 11.3, 11.4).
export const LIMITS = {
  anchorsPerPatch: { min: 1, max: 10 },
  opsPerPatch: { min: 1, max: 50 },
  checksPerPatch: { min: 0, max: 20 },
  textMaxLength: 2_000,
  htmlMaxLength: 10 * 1024, // 10 KB
  fingerprintTextMaxLength: 200,
  assistReasonMaxLength: 300,
  beaconPayloadMaxBytes: 32 * 1024,
  ancestorsMax: 5,
  candidatesCap: 5_000,
} as const;

export const URL_ALLOWED_PROTOCOLS = ['http:', 'https:', 'mailto:', 'tel:'] as const;

// ID prefixes (PLAN 11.1).
export const ID_PREFIXES = {
  user: 'usr_',
  project: 'prj_',
  patch: 'pat_',
  review: 'rev_',
  preview: 'prv_',
  snapshot: 'snp_',
  release: 'rel_',
  deployment: 'dep_',
  verification: 'ver_',
  drift: 'drf_',
  audit: 'aud_',
} as const;

// Header the browser apps send to act as a user (PLAN 11.12; identity is a picker, not auth).
export const USER_HEADER = 'x-patchwork-user';

// Ports, mirrored from .env.example for use in tests and URLs (PLAN 11.16).
export const DEFAULT_PORTS = {
  control: 4000,
  live: 4100,
  target: 4200,
  preview: 4300,
  web: 5173,
} as const;
