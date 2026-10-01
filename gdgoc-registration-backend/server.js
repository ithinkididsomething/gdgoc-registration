"use strict";

const { createApp } = require("./src/app");
const { env } = require("./config/env");

const app = createApp();

const server = app.listen(env.PORT, env.HOST, () => {
  const { address, port } = server.address();
  console.log(`GDGoC registration API listening on http://${address}:${port}`);
  console.log(`  env      : ${env.NODE_ENV}`);
  console.log(`  data dir : ${env.DATA_DIR}`);
  console.log(`  origins  : ${env.ALLOWED_ORIGINS.map(String).join(", ")}`);
});

// Slow-loris protection: cap how long a client may take to send its request.
server.headersTimeout = 20_000;
server.requestTimeout = 30_000;
server.keepAliveTimeout = 10_000;

/** Close the listener and let in-flight writes finish before exiting. */
function shutdown(signal) {
  console.log(`\n${signal} received — shutting down.`);
  server.close(() => {
    // Give queued registration writes a moment to land on disk.
    require("./src/registrations")
      .drain()
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
  // Do not hang forever on a stuck connection.
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
