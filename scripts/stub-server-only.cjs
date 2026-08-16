const Module = require("module");
const path = require("path");

const orig = Module._resolveFilename;
Module._resolveFilename = function resolveStub(request, parent, isMain, options) {
  if (request === "server-only") {
    return path.join(__dirname, "empty.cjs");
  }
  return orig.call(this, request, parent, isMain, options);
};
