/**
 * Central Supabase error handling.
 *
 * supabase-js resolves with `{ data, error }` and does NOT throw on a database
 * error, so a bare `await supabase.from(x).update(y)` silently does nothing.
 * Every mutation in this app must go through `unwrap` so a failure is always
 * surfaced, and so the UI can tell the user what actually went wrong instead of
 * rendering an empty list that looks like "you have no data".
 */

/** Error kinds the UI must be able to distinguish. */
export const ERROR_KIND = {
  NETWORK: 'network',
  UNAUTHENTICATED: 'unauthenticated',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'not_found',
  CONFLICT: 'conflict',
  VALIDATION: 'validation',
  SERVER: 'server',
  UNKNOWN: 'unknown',
};

export class SupabaseFailure extends Error {
  constructor(kind, message, { code, detail, hint, context } = {}) {
    super(message);
    this.name = 'SupabaseFailure';
    this.kind = kind;
    this.code = code;
    this.detail = detail;
    this.hint = hint;
    this.context = context;
  }
}

/** HTTP status if we can get one, else 0. */
function statusOf(error) {
  if (!error) return 0;
  const direct = error.status ?? error.statusCode;
  if (typeof direct === 'number') return direct;
  const msg = String(error.message || '');
  const m = msg.match(/\b([45]\d{2})\b/);
  return m ? Number(m[1]) : 0;
}

/** PostgREST error codes we care about. */
const PG = {
  NOT_FOUND: 'PGRST202',
  NO_ROWS: 'PGRST116',
  DUPLICATE: '23505',
  FK_VIOLATION: '23503',
  NOT_NULL: '23502',
  CHECK_VIOLATION: '23514',
  INVALID_TEXT: '22P02',
  PERMISSION: '42501',
  RLS_VIOLATION: '42501',
  FUNCTION_MISSING: '42883',
  AMBIGUOUS: '42702',
  INSUFFICIENT_PRIVILEGE: '42501',
};

const FRIENDLY = {
  [PG.NOT_FOUND]: 'This feature is not available yet. Please contact support.',
  [PG.FUNCTION_MISSING]: 'This action is not available yet. Please contact support.',
  [PG.NO_ROWS]: "We couldn't find what you were looking for.",
  [PG.DUPLICATE]: 'That already exists.',
  [PG.FK_VIOLATION]: 'That change references something that no longer exists.',
  [PG.NOT_NULL]: 'Some required information is missing.',
  [PG.CHECK_VIOLATION]: 'That value is not allowed.',
  [PG.PERMISSION]: "You don't have permission to do that.",
  [PG.INSUFFICIENT_PRIVILEGE]: "You don't have permission to do that.",
  [PG.RLS_VIOLATION]: "You don't have permission to view or change this.",
  [PG.AMBIGUOUS]: 'That request was ambiguous. Please try again.',
};

/**
 * Turn a Supabase error into a classified failure with copy a customer can read.
 * Never leaks a raw PostgREST body to the UI.
 */
export function classifyError(error, context) {
  if (!error) return null;

  const status = statusOf(error);
  const code = error.code || null;
  const rawMessage = String(error.message || '');

  // A failed fetch / DNS / offline never reaches PostgREST.
  const isNetwork =
    status === 0 &&
    /fetch|network|Failed to fetch|Load failed|ERR_NAME|ECONN|ETIMEDOUT|timeout/i.test(rawMessage);

  let kind = ERROR_KIND.UNKNOWN;
  if (isNetwork) kind = ERROR_KIND.NETWORK;
  else if (status === 401 || /jwt|token|auth session/i.test(rawMessage)) kind = ERROR_KIND.UNAUTHENTICATED;
  else if (status === 403 || code === PG.PERMISSION || /row-level security|permission denied/i.test(rawMessage))
    kind = ERROR_KIND.FORBIDDEN;
  else if (status === 404 || code === PG.NOT_FOUND || code === PG.FUNCTION_MISSING || code === PG.NO_ROWS)
    kind = ERROR_KIND.NOT_FOUND;
  else if (status === 409 || code === PG.DUPLICATE) kind = ERROR_KIND.CONFLICT;
  else if (status === 400 || code === PG.NOT_NULL || code === PG.CHECK_VIOLATION || code === PG.INVALID_TEXT)
    kind = ERROR_KIND.VALIDATION;
  else if (status >= 500) kind = ERROR_KIND.SERVER;

  const userMessage =
    FRIENDLY[code] ||
    {
      [ERROR_KIND.NETWORK]: "We couldn't reach the server. Check your connection and try again.",
      [ERROR_KIND.UNAUTHENTICATED]: 'Your session has expired. Please sign in again.',
      [ERROR_KIND.FORBIDDEN]: "You don't have permission to do that.",
      [ERROR_KIND.NOT_FOUND]: "We couldn't find what you were looking for.",
      [ERROR_KIND.CONFLICT]: 'That already exists.',
      [ERROR_KIND.VALIDATION]: 'Some of that information is not valid.',
      [ERROR_KIND.SERVER]: 'Something went wrong on our side. Please try again.',
    }[kind] ||
    'Something went wrong. Please try again.';

  return new SupabaseFailure(kind, userMessage, {
    code,
    detail: error.details || null,
    hint: error.hint || null,
    context,
  });
}

/**
 * Unwrap a Supabase response, throwing a classified SupabaseFailure on error.
 *
 * Usage:
 *   const rows = unwrap(await supabase.from('teams').select('*'), 'load teams');
 *   unwrap(await supabase.from('teams').insert(row), 'create team');
 *
 * Returns `data` (which may legitimately be null for a delete/head).
 */
export function unwrap(response, context) {
  if (!response) {
    throw new SupabaseFailure(ERROR_KIND.UNKNOWN, 'Something went wrong. Please try again.', { context });
  }
  if (response.error) throw classifyError(response.error, context);
  return response.data;
}

/** Non-throwing variant for read paths that want to branch on failure. */
export function tryUnwrap(response, context) {
  try {
    return { ok: true, data: unwrap(response, context), error: null };
  } catch (e) {
    const failure = e instanceof SupabaseFailure ? e : classifyError(e, context);
    return { ok: false, data: null, error: failure };
  }
}

/**
 * Message to show when a READ failed. Critical: a failed read must never be
 * rendered as "no data", which is how an outage looks like an empty account.
 */
export function readErrorMessage(failure) {
  if (!failure) return null;
  switch (failure.kind) {
    case ERROR_KIND.NETWORK:
      return "We couldn't reach the server. Check your connection and try again.";
    case ERROR_KIND.UNAUTHENTICATED:
      return 'Your session has expired. Please sign in again.';
    case ERROR_KIND.FORBIDDEN:
      return "You don't have permission to view this.";
    case ERROR_KIND.SERVER:
      return "We couldn't load this right now. Please try again.";
    default:
      return "We couldn't load this right now. Please try again.";
  }
}

export function toMessage(failure, fallback = 'Something went wrong. Please try again.') {
  if (!failure) return fallback;
  if (failure instanceof SupabaseFailure) return failure.message;
  if (typeof failure === 'string') return failure;
  return failure.message || fallback;
}
