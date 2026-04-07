import {
  getFranchiseeTargets,
  overrideFranchiseeTarget,
  resetFranchiseeOverride,
} from "../targets/targets.service.js";
import { success, error } from "../../../shared/utils/response.js";

export const getFranchiseeTarget = async (req, res) => {
  try {
    const { franchiseeId, periodId } = req.params;

    // Managers can only view their own franchisee
    if (
      req.user.kpiRole === "KPI Manager" &&
      String(req.user.franchiseeId) !== String(franchiseeId)
    ) {
      return error(res, "Forbidden: You can only view your own franchisee targets", null, 403);
    }

    const result = await getFranchiseeTargets(franchiseeId, periodId);
    return success(res, "Franchisee targets retrieved successfully", {
      franchiseeId,
      periodId,
      targets: result,
    });
  } catch (err) {
    return error(res, err.message);
  }
};

export const overrideFranchiseeTargetHandler = async (req, res) => {
  try {
    const { franchiseeId, periodId, kpiCode, overrideValue, reason } = req.body;

    if (!franchiseeId || !periodId || !kpiCode) {
      return error(res, "franchiseeId, periodId and kpiCode are required", null, 400);
    }

    const result = await overrideFranchiseeTarget(
      franchiseeId, periodId, kpiCode, overrideValue, req.user, reason,
    );
    return success(res, "Franchisee target overridden successfully", result);
  } catch (err) {
    return error(res, err.message);
  }
};

export const resetFranchiseeOverrideHandler = async (req, res) => {
  try {
    const { franchiseeId, periodId, kpiCode, reason } = req.body;

    if (!franchiseeId || !periodId || !kpiCode) {
      return error(res, "franchiseeId, periodId and kpiCode are required", null, 400);
    }

    const result = await resetFranchiseeOverride(
      franchiseeId, periodId, kpiCode, req.user, reason,
    );
    return success(res, "Franchisee target override reset successfully", result);
  } catch (err) {
    return error(res, err.message);
  }
};
