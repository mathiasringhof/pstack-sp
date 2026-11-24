# orders-service

Takes checkout requests from the storefront and places them with the payment provider.

- `src/client.js` talks to the payment provider.
- `src/retry.js` retries a failed call.

Run `node src/client.js` for a dry run against the sandbox provider.
