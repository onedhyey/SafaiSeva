// Which kind of caller identity the API accepts (audit F1 / F2).
//
//   clerk    : VITE_AUTH_ENABLED=true — a verified Clerk session token is required.
//   demo     : anonymous x-device-id sessions and the x-demo-worker / x-demo-officer role
//              headers. Anyone can mint these, so they are only for local development or a
//              deliberately separate public demo with no real rewards.
//   disabled : neither — every principal-resolving route answers 503.
//
// Demo identity is fail-closed: outside NODE_ENV=development it needs an explicit
// ALLOW_DEMO_IDENTITY=true, so a production deploy that forgot to enable Clerk refuses
// requests instead of handing out credits to self-asserted identities.

export type IdentityMode = 'clerk' | 'demo' | 'disabled';

export interface IdentityConfig {
  authEnabled: boolean;
  nodeEnv: string | undefined;
  allowDemo: boolean;
}

export function identityMode({ authEnabled, nodeEnv, allowDemo }: IdentityConfig): IdentityMode {
  if (authEnabled) return 'clerk';
  if (allowDemo || nodeEnv === 'development') return 'demo';
  return 'disabled';
}
