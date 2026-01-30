/**
 * Meta Marketing API Client
 *
 * Handles all HTTP communication with the Meta Graph API including:
 * - Automatic pagination
 * - Retry with exponential backoff on rate limits
 * - Error normalization
 */

const META_API_VERSION = 'v21.0';
const META_BASE_URL = `https://graph.facebook.com/${META_API_VERSION}`;
const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 2000;

export interface MetaApiError {
  message: string;
  type: string;
  code: number;
  error_subcode?: number;
  fbtrace_id?: string;
}

export class MetaApiException extends Error {
  code: number;
  type: string;
  subcode?: number;

  constructor(error: MetaApiError) {
    super(error.message);
    this.name = 'MetaApiException';
    this.code = error.code;
    this.type = error.type;
    this.subcode = error.error_subcode;
  }

  get isRateLimit(): boolean {
    return this.code === 32 || this.code === 4 || this.subcode === 2446079;
  }

  get isTokenExpired(): boolean {
    return this.code === 190;
  }
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Makes a single request to the Meta Graph API with retry logic.
 */
export async function metaApiFetch<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
  retryCount = 0
): Promise<T> {
  const url = new URL(`${META_BASE_URL}/${path}`);
  url.searchParams.set('access_token', accessToken);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  const body = await response.json();

  if (!response.ok || body.error) {
    const apiError = body.error as MetaApiError;
    const exception = new MetaApiException(apiError);

    // Retry on rate limit
    if (exception.isRateLimit && retryCount < MAX_RETRIES) {
      const backoff = INITIAL_BACKOFF_MS * Math.pow(2, retryCount);
      const jitter = Math.random() * 1000;
      console.warn(
        `[Meta API] Rate limited. Retrying in ${backoff + jitter}ms (attempt ${retryCount + 1}/${MAX_RETRIES})`
      );
      await sleep(backoff + jitter);
      return metaApiFetch<T>(path, accessToken, params, retryCount + 1);
    }

    throw exception;
  }

  return body as T;
}

/**
 * Fetches all pages of a paginated Meta API response.
 */
export async function metaApiFetchAll<T>(
  path: string,
  accessToken: string,
  params: Record<string, string> = {}
): Promise<T[]> {
  const allData: T[] = [];
  let nextUrl: string | null = null;

  // First request
  const firstResponse = await metaApiFetch<{
    data: T[];
    paging?: { next?: string; cursors?: { after?: string } };
  }>(path, accessToken, { ...params, limit: '500' });

  allData.push(...firstResponse.data);
  nextUrl = firstResponse.paging?.next ?? null;

  // Follow pagination
  while (nextUrl) {
    const response = await fetch(nextUrl);
    const body = await response.json();

    if (body.error) {
      const exception = new MetaApiException(body.error);
      if (exception.isRateLimit) {
        await sleep(INITIAL_BACKOFF_MS * 2);
        continue; // Retry same page
      }
      throw exception;
    }

    allData.push(...(body.data || []));
    nextUrl = body.paging?.next ?? null;
  }

  return allData;
}

/**
 * Exchange short-lived token for a long-lived token (60 days).
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET are required');
  }

  return metaApiFetch<{ access_token: string; expires_in: number }>(
    'oauth/access_token',
    shortLivedToken,
    {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: shortLivedToken,
    }
  );
}

/**
 * Refresh a long-lived token for a new long-lived token.
 * Meta allows exchanging a still-valid long-lived token before it expires.
 * Returns a new token with a fresh 60-day expiration.
 */
export async function refreshLongLivedToken(
  currentToken: string
): Promise<{ access_token: string; expires_in: number }> {
  const appId = process.env.META_APP_ID;
  const appSecret = process.env.META_APP_SECRET;

  if (!appId || !appSecret) {
    throw new Error('META_APP_ID and META_APP_SECRET are required');
  }

  return metaApiFetch<{ access_token: string; expires_in: number }>(
    'oauth/access_token',
    currentToken,
    {
      grant_type: 'fb_exchange_token',
      client_id: appId,
      client_secret: appSecret,
      fb_exchange_token: currentToken,
    }
  );
}

/**
 * Get ad accounts accessible by the token.
 */
export async function getAdAccounts(
  accessToken: string
): Promise<Array<{ id: string; account_id: string; name: string }>> {
  return metaApiFetchAll<{ id: string; account_id: string; name: string }>(
    'me/adaccounts',
    accessToken,
    { fields: 'id,account_id,name' }
  );
}
