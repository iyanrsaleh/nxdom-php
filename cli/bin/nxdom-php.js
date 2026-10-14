#!/usr/bin/env node
import { run } from '../src/index.js';

run(process.argv).catch((err) => {
  console.error(`FAIL: ${err.message}`);
  process.exitCode = 1;
});
