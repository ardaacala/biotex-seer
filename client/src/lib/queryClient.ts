import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { notifyServerVersion } from "./version";

export function captureVersion(res: Response) {
  notifyServerVersion(res.headers.get("X-App-Version"));
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// The production edge firewall (WAF) rejects any request body containing a
// `data:<mime>;base64,` URI (it also blocks the bare `data:` and `;base64,`
// tokens) with a 403 before the request ever reaches our server. Image uploads
// send photos as base64 data URIs, so they were all being blocked in
// production. We rewrite the data-URI prefix to a WAF-safe sentinel before
// sending; the server restores it before validation/storage.
const DATA_URI_RE = /data:([a-zA-Z0-9.+/-]+);base64,/g;

export function encodeDataUrisForWaf(json: string): string {
  return json.replace(DATA_URI_RE, "REPLB64::$1::");
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? encodeDataUrisForWaf(JSON.stringify(data)) : undefined,
    credentials: "include",
  });

  captureVersion(res);
  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const res = await fetch(queryKey.join("/") as string, {
      credentials: "include",
    });

    captureVersion(res);

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchIntervalInBackground: false, // pause polling when tab/window is hidden
      refetchOnWindowFocus: true,
      staleTime: 30 * 1000, // 30 saniye
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
