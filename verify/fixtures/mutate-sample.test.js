"use strict";
// 只看 ratio：flag 没有任何断言读它，所以把 true 改成 false 的变异一定活下来——
// 这正是变异测试要暴露的东西，也是自检里「survivor 必须被报出来」的那一条。

const assert = require("assert");
const { ratio } = require("./mutate-sample");

assert.strictEqual(ratio(0, 0), 0, "empty denominator is 0");
assert.strictEqual(ratio(1, 2), 0.5, "partial is 0.5");
assert.strictEqual(ratio(2, 2), 1, "full is 1");
process.stdout.write("mutate-sample ok\n");
