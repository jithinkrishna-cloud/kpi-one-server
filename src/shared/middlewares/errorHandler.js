import { error } from '../utils/response.js';

const errorHandler = (err, req, res, next) => {
  console.error('Unhandled Error:', err);

  const statusCode = err.status || 500;
  const message = err.message || 'Internal Server Error';
  const errorDetails = process.env.NODE_ENV === 'development' ? err.stack : null;

  return error(res, message, errorDetails, statusCode);
};

export default errorHandler;
