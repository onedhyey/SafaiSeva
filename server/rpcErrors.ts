// Maps errors from the SQL decision functions (0018+) to HTTP responses. Those functions
// raise a stable snake_case message; anything else is an unexpected database error and is
// logged server-side but never echoed to the client (audit F10).

export interface HttpError {
  status: number;
  message: string;
}

const KNOWN: Record<string, HttpError> = {
  handover_not_owned: { status: 403, message: 'This handover does not belong to your household.' },
  ward_scope: { status: 403, message: 'That household is outside your ward.' },
  worker_inactive: { status: 403, message: 'No active karmachari record for this session.' },
  worker_unlinked: { status: 403, message: 'This karmachari record is not linked to an account yet.' },
  not_owner: { status: 403, message: 'Only the household owner can do that.' },
  handover_not_found: { status: 404, message: 'Handover not found.' },
  household_not_found: { status: 404, message: 'That household is not registered.' },
  invite_invalid: { status: 404, message: 'That invite code is invalid or has expired.' },
  request_not_found: { status: 404, message: 'Join request not found.' },
  daily_limit: { status: 409, message: 'This household already has an approved handover for that day.' },
  not_in_review: { status: 409, message: 'This handover is no longer in review.' },
  already_member: { status: 409, message: 'This account is already linked to a household.' },
  request_closed: { status: 409, message: 'This join request was already decided.' },
  worker_cap: { status: 429, message: 'Daily issuance cap reached.' },
  worker_location_required: { status: 422, message: 'Turn on location — doorstep credit needs your position.' },
  worker_too_far: { status: 422, message: 'You need to be at the household to issue doorstep credit.' },
  too_few_streams: { status: 400, message: 'Confirm at least wet and dry.' },
  invalid_status: { status: 400, message: 'Invalid decision.' },
};

export function rpcError(err: { message?: string } | null | undefined): HttpError {
  const msg = String(err?.message ?? '');
  const key = Object.keys(KNOWN).find((k) => msg === k || msg.startsWith(k + ':'));
  if (key) return KNOWN[key];
  console.error('[db] unexpected error:', msg);
  return { status: 500, message: 'Something went wrong on our side. Please try again.' };
}
