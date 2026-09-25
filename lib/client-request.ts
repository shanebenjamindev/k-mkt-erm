export class RequestError extends Error {
  constructor(message: string, public readonly status: number, public readonly body: unknown = null) {
    super(message);
    this.name = "RequestError";
  }
}

export async function requestJson<T>(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<T> {
  const controller = new AbortController();
  const abort = () => controller.abort();
  init.signal?.addEventListener("abort", abort, { once: true });
  if (init.signal?.aborted) controller.abort();
  const timer = setTimeout(abort, timeoutMs);
  try {
    const headers = new Headers(init.headers);
    if (typeof init.body === "string" && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const body = await response.json().catch(() => null) as T & { error?: string };
    if (!response.ok) throw new RequestError(body?.error ?? `Yêu cầu không thành công (${response.status}). Vui lòng thử lại.`, response.status, body);
    if (body === null) throw new RequestError("Phản hồi máy chủ không hợp lệ. Vui lòng thử lại.", response.status);
    return body;
  } catch (error) {
    if (controller.signal.aborted && !init.signal?.aborted) throw new RequestError("Kết nối quá thời gian chờ. Vui lòng kiểm tra lại dữ liệu trước khi thử lại.", 408);
    if (error instanceof TypeError) throw new RequestError("Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.", 0);
    throw error;
  } finally {
    clearTimeout(timer);
    init.signal?.removeEventListener("abort", abort);
  }
}
