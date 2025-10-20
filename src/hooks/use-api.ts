import { useCallback } from 'react';
import useSWR, { type SWRConfiguration, type SWRResponse } from 'swr';
import { apiClient, type ApiClient, type ApiRequestOptions, type ApiError } from '../lib/services/api-client';

export interface UseApiConfig<T> {
  path: string | null;
  enabled?: boolean;
  options?: ApiRequestOptions;
  swr?: SWRConfiguration<T, ApiError>;
}

export interface UseApiResult<T> extends SWRResponse<T, ApiError> {
  loading: boolean;
  client: ApiClient;
  get: <TReturn = unknown>(path: string, options?: ApiRequestOptions) => Promise<TReturn>;
  post: <TReturn = unknown, TBody = unknown>(path: string, body?: TBody, options?: ApiRequestOptions) => Promise<TReturn>;
  put: <TReturn = unknown, TBody = unknown>(path: string, body?: TBody, options?: ApiRequestOptions) => Promise<TReturn>;
  del: <TReturn = unknown>(path: string, options?: ApiRequestOptions) => Promise<TReturn>;
}

const mergeOptions = (base?: ApiRequestOptions, override?: ApiRequestOptions): ApiRequestOptions | undefined => {
  if (!base && !override) {
    return undefined;
  }

  const baseHeaders = base?.headers ?? {};
  const overrideHeaders = override?.headers ?? {};

  return {
    ...(base ?? {}),
    ...(override ?? {}),
    headers: {
      ...baseHeaders,
      ...overrideHeaders,
    },
  };
};

export function useApi<T = unknown>({ path, enabled = true, options, swr }: UseApiConfig<T>): UseApiResult<T> {
  const shouldFetch = Boolean(enabled && path);

  const response = useSWR<T, ApiError>(
    shouldFetch ? path : null,
    () => {
      if (!path) {
        throw new Error('Path is required for useApi fetcher');
      }
      return apiClient.get<T>(path, options);
    },
    {
      revalidateOnFocus: false,
      ...swr,
    }
  );

  const get = useCallback(
    <TReturn = unknown>(requestPath: string, requestOptions?: ApiRequestOptions) =>
      apiClient.get<TReturn>(requestPath, mergeOptions(options, requestOptions)),
    [options]
  );

  const post = useCallback(
    <TReturn = unknown, TBody = unknown>(requestPath: string, body?: TBody, requestOptions?: ApiRequestOptions) =>
      apiClient.post<TReturn, TBody>(requestPath, body, mergeOptions(options, requestOptions)),
    [options]
  );

  const put = useCallback(
    <TReturn = unknown, TBody = unknown>(requestPath: string, body?: TBody, requestOptions?: ApiRequestOptions) =>
      apiClient.put<TReturn, TBody>(requestPath, body, mergeOptions(options, requestOptions)),
    [options]
  );

  const del = useCallback(
    <TReturn = unknown>(requestPath: string, requestOptions?: ApiRequestOptions) =>
      apiClient.del<TReturn>(requestPath, mergeOptions(options, requestOptions)),
    [options]
  );

  return {
    ...response,
    loading: response.isLoading ?? (!response.data && !response.error),
    client: apiClient,
    get,
    post,
    put,
    del,
  };
}

export default useApi;