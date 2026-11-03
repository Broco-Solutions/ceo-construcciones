import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Files share one disposable database and global code counters. Serializing
    // independent fixtures prevents cross-file SSI conflicts; each concurrency
    // scenario still runs its simultaneous operations inside the test.
    fileParallelism: false,
  },
});
