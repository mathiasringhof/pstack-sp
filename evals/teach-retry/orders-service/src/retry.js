const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 200;

function delayFor(attempt) {
  return BASE_DELAY_MS * 2 ** attempt + Math.floor(Math.random() * BASE_DELAY_MS);
}

async function withRetry(call, { retryOn = isTransient } = {}) {
  let lastError;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    try {
      return await call(attempt);
    } catch (error) {
      lastError = error;
      if (!retryOn(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, delayFor(attempt)));
    }
  }
  throw lastError;
}

function isTransient(error) {
  return error.status === 429 || error.status >= 500 || error.code === "ECONNRESET";
}

module.exports = { withRetry, isTransient, MAX_ATTEMPTS };
