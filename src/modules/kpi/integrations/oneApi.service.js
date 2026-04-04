import * as oneApi from "../../../shared/integrations/oneApi.service.js";

/**
 * KPI Module - ONE CRM Integration Wrapper
 * Decouples KPI business logic from the external ONE CRM API structure.
 * This is the ONLY place in the KPI module where external ONE API calls should reside.
 */

export const fetchLeads = async (params, token) => {
  return await oneApi.getLeads(params, token);
};

export const fetchDeals = async (params, token) => {
  return await oneApi.getDeals(params, token);
};

export const fetchQuotes = async (params, token) => {
  return await oneApi.getQuotes(params, token);
};

export const fetchOrders = async (params, token) => {
  return await oneApi.getOrders(params, token);
};

export const fetchCallLogs = async (params, token) => {
  return await oneApi.getCallLogs(params, token);
};

export const fetchMessageLogs = async (params, token) => {
  return await oneApi.getMessageLogs(params, token);
};

export const fetchEmployees = async (params, token) => {
  return await oneApi.getEmployees(params, token);
};

export const fetchTeams = async (params, token) => {
  return await oneApi.getTeams(params, token);
};

export const fetchRoles = async (params, token) => {
  return await oneApi.getRoles(params, token);
};
