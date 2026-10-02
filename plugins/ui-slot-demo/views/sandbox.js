/**
 * 沙箱边界自检：逐项判"该有的有、不该有的没有"。
 *
 * 断言方向刻意反过来：**拒绝才是通过**。所以这里把 undefined / 抛错都渲染成绿色。
 */
(function () {
  "use strict";

  var demo = window.__uiSlotDemo;
  var call = demo.call;
  var setText = demo.setText;
  var renderRow = demo.renderRow;

  /** presence=false 期望"不存在"，存在却反而是异常。 */
  function probeGlobal(name, shouldExist) {
    var exists = typeof window[name] !== "undefined";
    return {
      label: exists ? "存在" : "不存在",
      ok: shouldExist ? exists : !exists,
      detail: exists ? "存在（typeof=" + typeof window[name] + "）" : "不存在（undefined）",
    };
  }

  function probeNested(label, getter) {
    var value;
    try {
      value = getter();
    } catch (error) {
      return { ok: true, detail: "取不到：" + error.message };
    }
    var exists = typeof value !== "undefined";
    return {
      label: exists ? "存在" : "不存在",
      ok: !exists,
      detail: exists ? "存在（typeof=" + typeof value + "）" : "不存在（undefined）",
    };
  }

  async function main() {
    var container = demo.pick("bridge-keys");
    if (!demo.bridge) {
      setText("bridge-keys", "window.ccodePlugin 不存在 —— 宿主没有装插件页 preload");
      return;
    }
    setText("bridge-keys", Object.keys(demo.bridge).sort().join("\n"));

    var globals = demo.pick("globals-rows");
    globals.textContent = "";
    [
      ["require", false],
      ["process", false],
      ["module", false],
      ["exports", false],
      ["Buffer", false],
      ["ipcRenderer", false],
      ["electron", false],
      ["global", false],
      ["ccodePlugin", true],
    ].forEach(function (pair) {
      renderRow(globals, "window." + pair[0], probeGlobal(pair[0], pair[1]));
    });

    var host = demo.pick("host-rows");
    host.textContent = "";
    [
      ["window.ccode", function () { return window.ccode; }],
      ["window.__CCODE_DEVICE_ID__", function () { return window.__CCODE_DEVICE_ID__; }],
    ].forEach(function (pair) {
      renderRow(host, pair[0], probeNested(pair[0], pair[1]));
    });

    var reads = demo.pick("read-rows");
    reads.textContent = "";
    var probes = [
      { label: "readText(demo-data.txt)", path: "demo-data.txt", expectOk: true },
      { label: "readText(../plugin.json)", path: "../.ccode-plugin/plugin.json", expectOk: false },
      { label: "readText(/etc/hosts)", path: "/etc/hosts", expectOk: false },
      { label: "readDataText(notes.json)", command: "readDataText", path: "notes.json", expectOk: true },
    ];
    for (var i = 0; i < probes.length; i += 1) {
      var probe = probes[i];
      var outcome;
      try {
        var file = await call(probe.command || "readText", probe.path);
        outcome = {
          label: "允许",
          ok: probe.expectOk !== false,
          detail: "读到 " + file.content.length + " 字符",
        };
      } catch (error) {
        outcome = { label: "拒绝", ok: probe.expectOk === false, detail: error.message };
      }
      renderRow(reads, probe.label, outcome);
    }

    setText("loc-href", window.location.href);
    setText("loc-origin", window.location.origin);
    setText("loc-secure", String(window.isSecureContext));
  }

  document.addEventListener("DOMContentLoaded", function () {
    void main();
  });
})();
