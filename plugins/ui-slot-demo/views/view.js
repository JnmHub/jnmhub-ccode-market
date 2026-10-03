/**
 * 插件沙箱视图的共用脚本。
 *
 * 这里没有构建步骤、没有依赖：`ccode-plugin://` 协议下裸 `<script>` 就能加载相对路径，
 * 这正是"插件自带一个网页"的最小形态。
 *
 * 全部宿主能力都只有 `window.ccodePlugin` 这 11 个白名单方法（5 只读 + 6 数据通道，见宿主 preload）。
 */
(function () {
  "use strict";

  var bridge = window.ccodePlugin || null;

  function pick(id) {
    return document.getElementById(id);
  }

  function setText(id, text) {
    var node = pick(id);
    if (node) node.textContent = text == null ? "—" : String(text);
  }

  /**
   * 把一段异步探测渲染成"名字 + 结果徽标 + 细节"。
   *
   * 两个字段的语义要分清：`label` 是**实际结果**（允许/拒绝/存在/不存在），
   * `ok` 是**是否符合预期**（决定徽标颜色）。自检页里"拒绝"往往是绿色 —— 因为那正是预期。
   */
  function renderRow(container, name, outcome) {
    var row = document.createElement("div");
    row.className = "row";
    var nameEl = document.createElement("span");
    nameEl.className = "name";
    nameEl.textContent = name;
    var badge = document.createElement("span");
    badge.className = "badge " + (outcome.ok ? "ok" : "bad");
    badge.textContent = outcome.label || (outcome.ok ? "符合预期" : "不符预期");
    var detail = document.createElement("span");
    detail.className = "note";
    detail.textContent = outcome.detail || "";
    row.appendChild(nameEl);
    row.appendChild(badge);
    row.appendChild(detail);
    container.appendChild(row);
  }

  /**
   * 调桥。`method` 是**桥的方法名**（getInfo / getSettings / getTheme / readText /
   * readDataText），不是主进程那边的通道名（`plugin.getInfo` 之类）—— 后者是内部约定，
   * 插件作者看不到也不需要知道。
   */
  async function call(method, argument) {
    if (!bridge || typeof bridge[method] !== "function") {
      throw new Error("bridge-method-missing:" + method);
    }
    return argument === undefined ? await bridge[method]() : await bridge[method](argument);
  }

  window.__uiSlotDemo = { bridge: bridge, call: call, pick: pick, setText: setText, renderRow: renderRow };

  /** 主题：只有拿到桥的页面才能跟随宿主明暗。 */
  async function applyTheme() {
    if (!bridge) return;
    try {
      var theme = await call("getTheme");
      document.documentElement.setAttribute("data-appearance", theme.appearance);
      setText("theme-appearance", theme.appearance);
    } catch (error) {
      setText("theme-appearance", "不可用：" + error.message);
    }
  }

  document.addEventListener("DOMContentLoaded", function () {
    void applyTheme();
  });
})();
