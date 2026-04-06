import * as service from "./actuals.service.js";
import { success, error } from "../../../shared/utils/response.js";

/**
 * Controller: KPI Actuals & Attainment (F12-B)
 */

// ─── Manual Entry ─────────────────────────────────────────────────────────────

/**
 * POST /kpi/actuals/collection
 * Manager saves Collection Revenue (manual, immutable, note required).
 * Body: { executiveId, actualDate, value, note }
 */
export const createManualActual = async (req, res) => {
    const { executiveId, actualDate, kpiCode = "collection_revenue", value, note } = req.body;

    if (!executiveId || !actualDate || value === undefined || !note) {
        return error(
            res,
            "executiveId, actualDate, value, and note are all required for manual entries.",
            null,
            400
        );
    }

    try {
        await service.createManualActual({
            executive_id: executiveId,
            actual_date:  actualDate,
            kpi_code:     kpiCode,
            value,
            note,
            source:       "manual",
        });
        return success(res, "Manual actual saved. This entry is now immutable.");
    } catch (err) {
        const status =
            err.message.includes("immutable") || err.message.includes("not permitted") ? 422 : 500;
        return error(res, err.message, null, status);
    }
};

// ─── Auto Sync ────────────────────────────────────────────────────────────────

/**
 * POST /kpi/actuals/sync
 * Trigger real-time sync of auto KPIs for an executive in a period.
 * Body: { executiveId, periodId, kpiCodes? }
 */
export const syncActuals = async (req, res) => {
    const { executiveId, periodId, kpiCodes } = req.body;

    if (!executiveId || !periodId) {
        return error(res, "executiveId and periodId are required.", null, 400);
    }

    const token = req.cookies?.token || req.headers?.authorization?.split(" ")[1];

    try {
        const results = await service.syncAutoActuals(executiveId, periodId, token, kpiCodes || null);
        const failed  = results.filter((r) => r.status === "failed");

        return success(res, "Sync complete.", {
            synced: results.filter((r) => r.status === "synced").length,
            failed: failed.length,
            results,
            ...(failed.length
                ? { warning: `${failed.length} KPI(s) failed to sync. See results for details.` }
                : {}),
        });
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};

// ─── Actuals with Attainment ──────────────────────────────────────────────────

/**
 * GET /kpi/actuals/:executiveId/attainment?periodId=
 * Returns all KPIs with actuals + attainment %, breach flags, collection warnings.
 */
export const getActualsWithAttainment = async (req, res) => {
    const { executiveId } = req.params;
    const { periodId }    = req.query;

    if (!executiveId || !periodId) {
        return error(res, "executiveId and periodId are required.", null, 400);
    }

    try {
        const data = await service.getActualsWithAttainment(executiveId, periodId);
        return success(res, "Actuals with attainment retrieved.", data);
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};

// ─── Raw Actuals (date-range, no attainment) ──────────────────────────────────

/**
 * GET /kpi/actuals/:executiveId?from=&to=
 */
export const getActuals = async (req, res) => {
    const { executiveId } = req.params;
    const { from, to }    = req.query;

    if (!executiveId || !from || !to) {
        return error(res, "executiveId, from, and to are required.", null, 400);
    }

    try {
        const actuals = await service.getActuals(executiveId, from, to);
        return success(res, "Actuals retrieved.", actuals);
    } catch (err) {
        return error(res, err.message, null, 500);
    }
};
