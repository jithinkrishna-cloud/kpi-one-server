/**
 * Standard API Response Utility (ESM)
 */

export const sendResponse = (res, statusCode, success, message, data = null, error = null) => {
  return res.status(statusCode).json({
    success,
    message,
    data,
    error,
    timestamp: new Date().toISOString(),
  });
};

export const success = (res, message, data = null, statusCode = 200) => {
  return sendResponse(res, statusCode, true, message, data);
};

export const error = (res, message, errorDetails = null, statusCode = 500) => {
  return sendResponse(res, statusCode, false, message, null, errorDetails);
};
