import { ZodError } from "zod";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public headers?: HeadersInit,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function errorResponse(error: unknown): Response {
  if (error instanceof ApiError)
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details }),
        },
      },
      { status: error.status, headers: error.headers },
    );
  if (error instanceof ZodError)
    return Response.json(
      {
        error: {
          code: "VALIDATION_ERROR",
          message: "Datos inválidos.",
          details: error.issues,
        },
      },
      { status: 422 },
    );
  const code = (error as { code?: string })?.code;
  if (code === "P2002")
    return Response.json(
      { error: { code: "CONFLICT", message: "El registro ya existe." } },
      { status: 409 },
    );
  if (code === "P2025")
    return Response.json(
      { error: { code: "NOT_FOUND", message: "Registro no encontrado." } },
      { status: 404 },
    );
  if (code === "P2003")
    return Response.json(
      {
        error: {
          code: "INVALID_REFERENCE",
          message: "Referencia inexistente o registro en uso.",
        },
      },
      { status: 409 },
    );
  if (code === "P2004")
    return Response.json(
      {
        error: {
          code: "INTEGRITY_ERROR",
          message: "Los datos incumplen una restricción de integridad.",
        },
      },
      { status: 422 },
    );
  // Do not log request bodies, database queries or connection errors containing secrets.
  console.error("api_request_failed", {
    type: error instanceof Error ? error.name : "unknown",
  });
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "No se pudo completar la operación.",
      },
    },
    { status: 500 },
  );
}
