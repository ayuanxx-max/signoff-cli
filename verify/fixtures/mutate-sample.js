"use strict";
// 变异测试引擎的自检样本：两处被用例看住，一处没有。
// 断言写在 mutate-sample.test.js 里；tools/mutate.mjs 用它证明「能杀」和「会报活着」这两件事都成立。

function ratio(hit, total) {
  if (total <= 0) return 0;
  return hit >= total ? 1 : 0.5;
}

module.exports = { ratio, flag: true };
