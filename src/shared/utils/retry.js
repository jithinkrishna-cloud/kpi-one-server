/**
 * Retries an asynchronous function with exponential backoff.
 * @param {Function} fn - The async function to retry.
 * @param {number} retries - Maximum number of retries.
 * @param {number} delay - Primary delay in ms.
 * @returns {Promise<any>}
 */
export const withRetry = async (fn, retries = 3, delay = 1000) => {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) {
      throw error;
    }

    // Only retry on network errors or 5xx server errors
    const isNetworkError = !error.response;
    const isServerError = error.response?.status >= 500;

    if (isNetworkError || isServerError) {
      console.warn(`Retrying ONE API call... (${retries} left). Error: ${error.message}`);
      await new Promise((resolve) => setTimeout(resolve, delay));
      return withRetry(fn, retries - 1, delay * 2);
    }

    // Don't retry on 4xx (Client errors)
    throw error;
  }
};
