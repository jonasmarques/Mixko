/**
 * Minimal declarations for the two node builtins the unit tests use.
 *
 * The project has no @types/node dependency and the tests only need these few
 * signatures, so declaring them here keeps `npm test` dependency-free.
 */

declare module 'node:test' {
    function test(name: string, fn: () => void | Promise<void>): void;
    export default test;
}

declare module 'node:assert/strict' {
    interface Assert {
        (value: unknown, message?: string): void;
        equal(actual: unknown, expected: unknown, message?: string): void;
        deepEqual(actual: unknown, expected: unknown, message?: string): void;
        ok(value: unknown, message?: string): void;
    }
    const assert: Assert;
    export default assert;
}
