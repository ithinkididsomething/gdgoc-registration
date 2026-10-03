"use strict";

/**
 * Vercel serverless entry point.
 *
 * WHY A SEPARATE FILE: server.js calls app.listen(), which is meaningless in a
 * serverless function - there is no socket to hold open and the platform
 * terminates the process when the response is sent. Vercel wants the Express
 * app itself, and it manages the HTTP lifecycle.
 *
 * So `app` is exported rather than listened on, and server.js stays exactly as
 * it is for local runs and any host with a real process model. The two share
 * src/app.js, so routing, validation and the store are identical in both - the
 * only thing that differs is who owns the socket.
 *
 * Note what does NOT appear here: no roster loading, no Firestore setup. Both
 * happen lazily on first request, which is what makes a cold start tolerable.
 */

// This file is api/index.js, so the app is one directory UP. A leading "./"
// would look for api/src/app and fail with "Cannot find module" - which is
// exactly what happened the first time.
const { createApp } = require("../src/app");

// Built once per warm container. `createApp()` only wires middleware; it does
// not touch the filesystem or the network.
const app = createApp();

module.exports = app;
module.exports.default = app;
