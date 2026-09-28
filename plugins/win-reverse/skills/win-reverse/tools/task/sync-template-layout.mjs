import fs from "node:fs";
import path from "node:path";
import {
  compatibilityExtensionDir,
  ensureDir,
  getTopicExtensionFile,
  getTopicExtensionSourcePath,
  listRegistryTopics
} from "./common.mjs";

function copyFile(from, to) {
  ensureDir(path.dirname(to));
  fs.copyFileSync(from, to);
}

// P1-6（round1 F-07）平铺兼容层退役：原"core → 平铺根 + topic pack → _TEMPLATE/run/
// 平铺专题模板"的再生成循环已移除——平铺版专题模板按裁决表整体删除，pack 目录是
// 唯一模板源。重跑本脚本只刷新仍被 loadExtensionTemplate 回退消费的 extensions/*.json
// 兼容副本；若需恢复旧平铺布局，请回退本脚本与 F-07 的删除提交。
ensureDir(compatibilityExtensionDir);

for (const topic of listRegistryTopics()) {
  const extensionSourcePath = getTopicExtensionSourcePath(topic);
  const compatibilityFile = getTopicExtensionFile(topic);
  if (extensionSourcePath && compatibilityFile) {
    copyFile(extensionSourcePath, path.join(compatibilityExtensionDir, compatibilityFile));
  }
}

console.log("sync-template-layout: compatibility extensions refreshed from topic packs (flat template layer retired by round1 F-07)");
