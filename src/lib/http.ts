import { ZodError, type ZodType } from "zod";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const unauthorized = () => new HttpError(401, "UNAUTHENTICATED", "Sign in to continue.");
export const forbidden = (msg = "You do not have permission to do that.") => new HttpError(403, "FORBIDDEN", msg);
export const notFound = (what = "Resource") => new HttpError(404, "NOT_FOUND", `${what} not found.`);
export const conflict = (code: string, msg: string, details?: unknown) => new HttpError(409, code, msg, details);
export const badRequest = (msg: string, details?: unknown) => new HttpError(400, "BAD_REQUEST", msg, details);

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

// Wraps a route handler so every error leaves as { error: { code, message, details? } }.
export function route<C>(fn: Handler<C>): Handler<C> {
  return async (req, ctx) => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof HttpError) {
        return Response.json(
          { error: { code: err.code, message: err.message, details: err.details } },
          { status: err.status },
        );
      }
      if (err instanceof ZodError) {
        return Response.json(
          { error: { code: "VALIDATION", message: err.issues[0]?.message ?? "Invalid input.", details: err.issues } },
          { status: 400 },
        );
      }
      console.error(err);
      return Response.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
    }
  };
}

export async function parseJson<T>(req: Request, schema: ZodType<T>): Promise<T> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    throw badRequest("Request body must be JSON.");
  }
  return schema.parse(body);
}
