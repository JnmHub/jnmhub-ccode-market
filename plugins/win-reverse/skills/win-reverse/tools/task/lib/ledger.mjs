import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";

// 影子账本：append-only 哈希链，per-task 一个 JSONL。
// 事件写入即不可回拨：篡改历史事件会让其后全部 hash 失配（chainValid=false）。
// 无密钥防伪上限见 docs/reference/multi-agent-orchestration.md「对账」节：
// 本机制抬高伪造成本 + 留可审计指纹，不承诺绝对防伪。

export function ledgerRoot() {
  return path.resolve(
    process.env.WIN_REVERSE_LEDGER_ROOT || path.join(os.homedir(), ".win-reverse", "ledger")
  );
}

export function ledgerPath(taskId) {
  return path.join(ledgerRoot(), `${String(taskId || "").trim()}.jsonl`);
}

function sha256Text(text) {
  return crypto.createHash("sha256").update(String(text), "utf8").digest("hex");
}

function canonicalEventBody(event) {
  return JSON.stringify({
    seq: event.seq,
    ts: event.ts,
    kind: event.kind,
    payload: event.payload ?? {}
  });
}

export function computeEventHash(prevHash, event) {
  return sha256Text(`${prevHash}\n${canonicalEventBody(event)}`);
}

export function readLedger(taskId) {
  const filePath = ledgerPath(taskId);
  const result = { exists: false, path: filePath, events: [], chainValid: true, breaks: [] };
  if (!fs.existsSync(filePath)) {
    return result;
  }
  result.exists = true;
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/).filter((line) => line.trim());
  let prevHash = "GENESIS";
  lines.forEach((line, index) => {
    let event = null;
    try {
      event = JSON.parse(line);
    } catch {
      result.chainValid = false;
      result.breaks.push(`line ${index + 1}: invalid JSON`);
      return;
    }
    const expectedSeq = index + 1;
    if (event.seq !== expectedSeq) {
      result.chainValid = false;
      result.breaks.push(`line ${index + 1}: seq ${event.seq} != expected ${expectedSeq}`);
    }
    if (event.prevHash !== prevHash) {
      result.chainValid = false;
      result.breaks.push(`line ${index + 1}: prevHash mismatch (history rewritten?)`);
    }
    const recomputed = computeEventHash(event.prevHash, event);
    if (event.hash !== recomputed) {
      result.chainValid = false;
      result.breaks.push(`line ${index + 1}: hash mismatch (event content tampered?)`);
    }
    prevHash = event.hash;
    result.events.push(event);
  });
  return result;
}

export function appendLedgerEvent(taskId, kind, payload = {}) {
  const filePath = ledgerPath(taskId);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const current = readLedger(taskId);
  const prevHash = current.events.length > 0 ? current.events[current.events.length - 1].hash : "GENESIS";
  const event = {
    seq: current.events.length + 1,
    ts: new Date().toISOString(),
    kind: String(kind || "").trim(),
    payload: payload && typeof payload === "object" ? payload : {}
  };
  event.hash = computeEventHash(prevHash, event);
  event.prevHash = prevHash;
  fs.appendFileSync(filePath, `${JSON.stringify(event)}\n`, "utf8");
  return event;
}

export function findLedgerEvents(taskId, predicate) {
  const { events } = readLedger(taskId);
  return events.filter(predicate);
}

export function latestLedgerEvent(taskId, predicate) {
  const matches = findLedgerEvents(taskId, predicate);
  return matches.length > 0 ? matches[matches.length - 1] : null;
}

export function sha256File(filePath) {
  return sha256Text(fs.readFileSync(filePath));
}
