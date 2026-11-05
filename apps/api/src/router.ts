import { handlerSelections } from "./modules/selections";
import { handlerInventoryBatches } from "./modules/inventory-batches";
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
import { handlerCommercial } from "./modules/commercial";
import { handlerOrderAdministration } from "./modules/order-administration";
import { handlerReceiptDesk } from "./modules/receipt-desk";
import { handlerReferencePrices } from "./modules/reference-prices";
import { handlerCostReferences } from "./modules/cost-references";
import { handlerBudgetCostUpdates } from "./modules/budget-cost-updates";
import { handlerNetNeeds } from "./modules/net-needs";
import { handlerManagementReports } from "./modules/management-reports";
import { schemaCapabilities } from "./core/db";

export async function dispatch(
  request: Request,
  segments: string[],
): Promise<Response> {
  let response: Response;
  try {
    assertOrigin(request);
    const capabilities = await schemaCapabilities(true);
    if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(request.method))
      throw new ApiError(405, "METHOD_NOT_ALLOWED", "Método no permitido");
    const identityResponse = await identity(request, segments);
    if (identityResponse) response = identityResponse;
    else {
      const actor = await authenticate(request);
      const feature = segments[0];
      const unavailable =
        (feature === "clients" && !capabilities.clients) ||
        (["budget-editor", "budget-templates", "budget-issues"].includes(
          feature,
        ) &&
          (!capabilities.clients || !capabilities.commercial)) ||
        ([
          "order-administration",
          "receipt-desk",
          "reception-delegations",
        ].includes(feature) &&
          !capabilities.receptions) ||
        (feature === "reports" &&
          ["clients", "purchases"].includes(segments[1]) &&
          (!capabilities.clients || !capabilities.commercial));
      if (unavailable)
        throw new ApiError(
          503,
          "FEATURE_NOT_ENABLED",
          "Esta función todavía no está habilitada en este entorno. Se requiere la migración de aplicación autorizada.",
        );
      if (
        actor.role === "ADMINISTRACION" &&
        !["order-administration", "receipt-desk"].includes(segments[0]) &&
        !(
          segments[0] === "purchase-orders" &&
          segments[2] === "receipts" &&
          request.method === "POST"
        )
      )
        throw new ApiError(
          403,
          "FORBIDDEN",
          "Su perfil sólo permite la administración informativa de órdenes.",
        );
      let result: Response | null = null;
      for (const handler of [
        handlerSelections,
        handlerCostReferences,
        handlerBudgetCostUpdates,
        handlerOrderAdministration,
        handlerReceiptDesk,
        handlerReferencePrices,
        handlerNetNeeds,
        handlerManagementReports,
        handlerCommercial,
        handlerCatalog,
        handlerBudgets,
        handlerInventoryBatches,
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
