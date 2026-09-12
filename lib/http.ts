export function jsonError(message: string, status: number) {
  return Response.json({ error: message }, { status });
}

export async function readJson<T>(request: Request): Promise<{ ok: true; body: T } | { ok: false; response: Response }> {
  try {
    return { ok: true, body: (await request.json()) as T };
  } catch {
    return { ok: false, response: jsonError("invalid JSON", 400) };
  }
}
