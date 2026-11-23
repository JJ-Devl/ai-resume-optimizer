import type {
  Generation,
  MockScenario,
  ApplicationSummary,
  SavedApplication,
} from "@/types/optimization";

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
    path === "optimizations" || path.endsWith("/documents")
      ? 120000
      : path === "documents/preview"
        ? 30000
        : 8000,
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
          : path === "optimizations"
            ? "Optimization took too long. Check History before retrying; it may have been saved. API charges may still apply, and retrying starts a new request."
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

export function getApplications(status?: "generated" | "applied") {
  return apiRequest<{ items: ApplicationSummary[]; limit: number }>(
    status ? "optimizations?status=" + status : "optimizations",
  );
}
export function getApplication(id: string) {
  return apiRequest<SavedApplication>(
    "optimizations/" + encodeURIComponent(id),
  );
}

export function generateDocuments(id: string) {
  return apiRequest<SavedApplication>(
    "optimizations/" + encodeURIComponent(id) + "/documents",
    { method: "POST" },
  );
}
export function getDocumentDownload(id: string, format: "docx" | "pdf") {
  return apiRequest<{ url: string; expiresAt: string }>(
    "optimizations/" + encodeURIComponent(id) + "/documents/" + format,
  );
}
export function deleteApplication(id: string) {
  return apiRequest<{ deleted: boolean }>(
    "optimizations/" + encodeURIComponent(id),
    { method: "DELETE" },
  );
}

export function setApplicationApplied(id: string, applied: boolean) {
  return apiRequest<{ id: string; applied: boolean }>(
    "optimizations/" + encodeURIComponent(id) + "/status",
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ applied }),
    },
  );
}
