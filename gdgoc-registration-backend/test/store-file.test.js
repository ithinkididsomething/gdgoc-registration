"use strict";

/**
 * The contract suite, run against the file driver.
 *
 * Every other engine gets an identical file that calls `runStoreContract` with
 * its own driver. If a new store cannot pass this, it is not a drop-in
 * replacement, however good its README is.
 *
 * No Firebase project and no emulator needed - this half of the guarantee is
 * free and runs on every `npm test`.
 */

const { test } = require("node:test");
const os = require("node:os");
const path = require("node:path");

// Redirect the store's file writes before config/env is required. This file's
// DATA_DIR is private to it; api.test.js sets its own for the HTTP tests.
const DRIVER_DIR = path.join(os.tmpdir(), `gdgoc-contract-file-${process.pid}-${Date.now()}`);
process.env.DATA_DIR = DRIVER_DIR;
process.env.NODE_ENV = "test";

const { runStoreContract } = require("./helpers/store-contract");

// Required lazily: the driver reads env.DATA_DIR at construction, and the env
// assignment above has to land first.
runStoreContract({
  test,
  label: "file",
  makeDriver: () => require("../src/store/file"),
});
