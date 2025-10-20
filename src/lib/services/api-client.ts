import { config } from '../config';

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface ApiRequestOptions {
  token?: string;
  headers?: Record<string, string | undefined>;
  signal?: AbortSignal;
  baseUrl?: string;
  credentials?: RequestCredentials;
}

export class ApiError<T = unknown> extends Error {
  status: number;
  data: T | null;
  url: string;

  constructor(message: string, status: number, data: T | null, url: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
    this.url = url;
  }
}

const isAbsoluteUrl = (path: string) => /^https?:\/\//i.test(path);

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const ensureLeadingSlash = (value: string) => (value.startsWith('/') ? value : `/${value}`);

const buildUrl = (path: string, baseUrl: string) => {
  if (!path) {
    return trimTrailingSlash(baseUrl);
  }
  if (isAbsoluteUrl(path)) {
    return path;
  }
  return `${trimTrailingSlash(baseUrl)}${ensureLeadingSlash(path)}`;
};

const isBodyInit = (value: unknown): value is BodyInit => {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return true;
  if (value instanceof Blob || value instanceof FormData || value instanceof URLSearchParams) return true;
  if (value instanceof ArrayBuffer || ArrayBuffer.isView(value)) return true;
  if (typeof ReadableStream !== 'undefined' && value instanceof ReadableStream) return true;
  return false;
};

const sanitizeHeaders = (headers: Record<string, string | undefined> = {}) =>
  Object.fromEntries(
    Object.entries(headers).filter(([, value]) => value !== undefined && value !== null) as Array<[string, string]>
  );

async function request<TResponse = unknown, TBody = unknown>(
  method: HttpMethod,
  path: string,
  body?: TBody,
  options: ApiRequestOptions = {}
): Promise<TResponse> {
  const baseUrl = options.baseUrl ?? config.api.baseUrl;
  const url = buildUrl(path, baseUrl);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    ...sanitizeHeaders(options.headers),
  };

  const token = options.token ?? config.api.token;
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  let payload: BodyInit | undefined;
  if (body !== undefined) {
    if (isBodyInit(body)) {
      payload = body;
    } else {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }
  }

  const fetchOptions: RequestInit = {
    method,
    headers,
    body: payload,
    signal: options.signal,
  };

  if (options.credentials) {
    fetchOptions.credentials = options.credentials;
  }

  let response: Response;

  try {
    response = await fetch(url, fetchOptions);
  } catch (error) {
    throw new ApiError((error as Error).message, 0, null, url);
  }

  const contentType = response.headers.get('content-type') ?? '';
  let data: unknown = null;

  if (response.status !== 204 && response.status !== 205) {
    if (contentType.includes('application/json')) {
      data = await response.json().catch(() => null);
    } else if (contentType.startsWith('text/')) {
      data = await response.text().catch(() => null);
    }
  }

  if (!response.ok) {
    const message =
      typeof data === 'object' && data !== null && 'message' in data
        ? String((data as { message: unknown }).message)
        : `Request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data, url);
  }

  return data as TResponse;
}

export const apiClient = {
  get<TResponse = unknown>(path: string, options?: ApiRequestOptions) {
    return request<TResponse>('GET', path, undefined, options);
  },
  post<TResponse = unknown, TBody = unknown>(path: string, body?: TBody, options?: ApiRequestOptions) {
    return request<TResponse, TBody>('POST', path, body, options);
  },
  put<TResponse = unknown, TBody = unknown>(path: string, body?: TBody, options?: ApiRequestOptions) {
    return request<TResponse, TBody>('PUT', path, body, options);
  },
  del<TResponse = unknown>(path: string, options?: ApiRequestOptions) {
    return request<TResponse>('DELETE', path, undefined, options);
  },
};

export type ApiClient = typeof apiClient;