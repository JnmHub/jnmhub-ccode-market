/**
 * 探测视图的脚本。
 *
 * 两件事：
 *  1. 把"我是第几个探测视图"写进标题与正文，便于从 CDP 目标列表/标签标题上分辨；
 *  2. 暴露两个**不会自己调用**的动作，供宿主侧验收脚本从外部触发：
 *     `tryNavigate()`（改 location → 应被 `will-navigate` 拦下）与
 *     `tryOpen()`（window.open → 应被 `setWindowOpenHandler` 拒绝并返回 null）。
 *     页面本身不弹窗、不跳转，所以人工打开这一页时看不出任何异常行为。
 */
(function () {
  "use strict";

  var index = document.body.getAttribute("data-probe") || "?";
  document.title = "probe-" + index;

  var out = document.getElementById("probe-out");
  if (out) {
    out.textContent =
      "这是第 " + index + " 个探测视图。它存在的意义是让宿主侧能验证「同时存活上限 4」的 LRU 淘汰与自动重建。";
  }

  window.__uiSlotProbe = {
    tryNavigate: function () {
      window.location.href = "https://example.com/blocked-by-host";
    },
    tryOpen: function () {
      return window.open("https://example.com/blocked-by-host", "_blank");
    },
  };
})();
