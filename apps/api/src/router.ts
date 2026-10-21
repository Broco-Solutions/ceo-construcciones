import { authenticate, assertOrigin } from "./core/auth";
import { errorResponse, ApiError } from "./core/errors";
import { identity } from "./modules/identity";
import { handlerCatalog } from "./modules/catalog";
import { handlerBudgets } from "./modules/budgets";
import { handlerInventory } from "./modules/inventory";
import { handlerProcurement } from "./modules/procurement";
import { handlerExports } from "./modules/exports";
import { handlerImports } from "./modules/imports";
import { handlerReports } from "./modules/reports";

export async function dispatch(
  request: Request,
  segments: string[],
): Promise<Response> {
  let response: Response;
  try {
    assertOrigin(request);
    if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(request.method))
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Método no permitido");
    const identityResponse = await identity(request, segments);
    if (identityResponse) response = identityResponse;
    else {
      const actor = await authenticate(request);
      let result: Response | null = null;
      for (const handler of [
        handlerCatalog,
        handlerBudgets,
        handlerInventory,
        handlerProcurement,
        handlerImports,
        handlerReports,
        handlerExports,
      ]) {
        result = await handler(request, actor, segments);
        if (result) break;
      }
      if (!result) throw new ApiError(404, "NOT_FOUND", "Ruta inexistente");
      response = result;
    }
  } catch (error) {
    response = errorResponse(error);
  }
  response.headers.set("cache-control", "no-store");
  response.headers.set("x-content-type-options", "nosniff");
  return response;
}
