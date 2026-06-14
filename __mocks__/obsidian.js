"use strict";
// Minimal stub for the obsidian module used in Node test environment.
// The real requestUrl is never called in tests — providers inject a fetchImpl.
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestUrl = async function requestUrl() {
  throw new Error("requestUrl called in test environment without mock — inject fetchImpl instead");
};
