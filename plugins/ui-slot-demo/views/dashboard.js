/**
 * 「插槽演示」页的逻辑。
 *
 * 依赖 view.js 暴露的 `window.__uiSlotDemo`（不用模块语法：这里没有任何打包步骤，
 * 裸 script 是最省事也最不容易坏的形态）。
 */
(function () {
  "use strict";

  var demo = window.__uiSlotDemo;
  var call = demo.call;
  var setText = demo.setText;
  var renderRow = demo.renderRow;

  function json(value) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      return String(value);
    }
  }

  async function fillIdentity() {
    var info = await call("getInfo");
    setText("info-id", info.id);
    setText("info-name", info.name);
    setText("info-version", info.version);
    setText("info-marketplace", info.marketplace);
    setText("info-view", info.viewId);
  }

  async function fillSettings() {
    var settings = await call("getSettings");
    setText("settings-values", json(settings.values));
    setText("settings-withheld", json(settings.withheld));
  }

  async function fillRootRead() {
    try {
      var file = await call("readText", "demo-data.txt");
      setText("root-read-status", "读取成功（" + file.content.length + " 字符）");
      setText("root-read-body", file.content.trim());
    } catch (error) {
      setText("root-read-status", "失败：" + error.message);
    }
  }

  async function fillDataRead() {
    try {
      var file = await call("readDataText", "notes.json");
      setText("data-read-status", "读取成功（" + file.content.length + " 字符）");
      setText("data-read-body", file.content.trim());
    } catch (error) {
      setText("data-read-status", "失败：" + error.message);
      setText("data-read-body", "（数据目录不存在或没有该文件；宿主不会替插件创建目录）");
    }
  }

  /**
   * 越界自检：`expect` 写的是**期望的结果**，所以"被拒绝"才渲染成绿色。
   *
   * 第三项值得注意：宿主对任何含 `..` 的路径**一律拒绝**，不做"归一化后还在根内就放行"。
   * 这是有意的 —— 路径归一化只发生在声明期（`ui.views[].entry` 的形状校验），
   * 运行期多一条归一化规则就多一条"两处判定不一致"的路。
   */
  async function fillBoundary() {
    var container = demo.pick("boundary-rows");
    container.textContent = "";
    var probes = [
      { path: "../../package.json", why: "相对路径向上逃逸", expect: "reject" },
      { path: "/etc/hosts", why: "绝对路径", expect: "reject" },
      { path: "views/../demo-data.txt", why: "含 .. 的路径一律拒（不归一化放行）", expect: "reject" },
      { path: "demo-data.txt", why: "对照：正常相对路径", expect: "allow" },
    ];
    for (var i = 0; i < probes.length; i += 1) {
      var probe = probes[i];
      var read = null;
      var error = null;
      try {
        read = await call("readText", probe.path);
      } catch (caught) {
        error = caught;
      }
      var allowed = read !== null;
      renderRow(container, probe.path, {
        label: allowed ? "允许" : "拒绝",
        ok: probe.expect === "allow" ? allowed : !allowed,
        detail:
          probe.why +
          " → " +
          (allowed ? "读到 " + read.content.length + " 字符" : error.message),
      });
    }
  }

  async function main() {
    if (!demo.bridge) {
      setText("info-id", "window.ccodePlugin 不存在（宿主 preload 没装上）");
      return;
    }
    var steps = [fillIdentity, fillSettings, fillRootRead, fillDataRead, fillBoundary];
    for (var i = 0; i < steps.length; i += 1) {
      try {
        await steps[i]();
      } catch (error) {
        // 单步失败不影响其它卡片，页面上能直接看出是哪一项挂的。
        // eslint-disable-next-line no-console
        console.error("[ui-slot-demo] step failed", error);
      }
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    void main();
  });
})();
