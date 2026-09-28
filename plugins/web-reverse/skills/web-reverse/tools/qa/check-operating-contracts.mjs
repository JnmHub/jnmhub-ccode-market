import { failWith, readText } from "./common.mjs";

const findings = [];

function requireOrder(relPath, needles) {
  const text = readText(relPath);
  let lastIndex = -1;
  for (const needle of needles) {
    const nextIndex = text.indexOf(needle);
    if (nextIndex < 0) {
      findings.push(`${relPath} is missing required anchor: ${needle}`);
      return;
    }
    if (nextIndex < lastIndex) {
      findings.push(`${relPath} violates required order: ${needles.join(" -> ")}`);
      return;
    }
    lastIndex = nextIndex;
  }
}

function requireIncludes(relPath, needles) {
  const text = readText(relPath);
  for (const needle of needles) {
    if (!text.includes(needle)) {
      findings.push(`${relPath} is missing required text: ${needle}`);
    }
  }
}

function requireExcludes(relPath, needles) {
  const text = readText(relPath);
  for (const needle of needles) {
    if (text.includes(needle)) {
      findings.push(`${relPath} still contains forbidden text: ${needle}`);
    }
  }
}

// report-only 契约锚点：output-contract 必填六节按序出现。
requireOrder("docs/reference/output-contract.md", [
  "任务目标与结果",
  "实现路径",
  "逆向思路",
  "难点与坑点",
  "经验沉淀",
  "交付物与复现"
]);

requireIncludes("docs/reference/output-contract.md", [
  "未跑通就如实写未跑通与卡点",
  "会话态 / cookie / token / storage 快照必须脱敏"
]);

requireExcludes("docs/reference/output-contract.md", [
  "state/external-research",
  "task-close.mjs",
  "assert-can-reply"
]);

// 启动协议锚点：boot 单命令 + 骨架续跑判定。
requireIncludes("docs/reference/reverse-bootstrap.md", [
  "task-init.mjs",
  "骨架生成于"
]);

requireExcludes("docs/reference/reverse-bootstrap.md", [
  "task-boot",
  "task-sync",
  "task-advance"
]);

failWith(findings, "check-operating-contracts");
