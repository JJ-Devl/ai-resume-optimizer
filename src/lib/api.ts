import type { Generation, MockScenario } from "@/types/optimization";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options?: RequestInit,
): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(),
    path === "documents/preview" ? 30000 : 8000,
  );
  try {
    const response = await fetch(`/api/${path}`, {
      ...options,
      signal: controller.signal,
      cache: "no-store",
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
      throw new ApiError(
        body?.error?.message ??
          "The backend is unavailable. Make sure it is running, then try again.",
        body?.error?.code ?? "BACKEND_UNAVAILABLE",
        response.status,
      );
    }
    if (body === null)
      throw new ApiError(
        "The server returned an unexpected response.",
        "INVALID_RESPONSE",
      );
    return body as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted)
      throw new ApiError(
        path === "documents/preview"
          ? "Reading the resume took too long. Try again with a simpler document."
          : "The request took too long. Check History before retrying in case it was saved.",
        "CLIENT_TIMEOUT",
      );
    throw new ApiError(
      "Could not reach the server. Check your connection and make sure the backend is running.",
      "NETWORK_ERROR",
    );
  } finally {
    clearTimeout(timer);
  }
}

export function getHistory() {
  return apiRequest<{ items: Generation[]; limit: number }>("generations");
}
export function getCapabilities() {
  return apiRequest<{
    mode: "mock";
    simulationsEnabled: boolean;
    scenarios: MockScenario[];
  }>("capabilities");
}
