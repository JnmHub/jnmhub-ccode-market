#!/usr/bin/env node
/**
 * 生成每个插件的图标（128×128 PNG，透明底，只画图形本身）。
 *
 * 为什么用 SVG 而不是文生图：市场图标要 128×128、**透明底**、在明暗两套主题下都清楚，
 * 而且要 9 个风格一致。文生图很难稳定给出真透明通道，也无法保证同一套视觉语言；
 * 手写 SVG 再栅格化则是确定的、可复查的、改一个数字就能重生成。
 *
 * 视觉约定（改设计时请沿用）：
 *   - viewBox 0 0 128 128，线宽 9，圆头圆角，只描边不填背景板；
 *   - 主色是饱和中间调（在白底与深灰底上都读得出来），不要纯白/纯黑；
 *   - 不排文字：128px 下文字必然糊。
 *
 * sharp 的解析位置：优先本仓库 node_modules，其次环境变量 SHARP_REQUIRE_BASE 指向的
 * 目录（本机开发时那个目录是 ccode 仓库里已铺好的插件 node_modules）。
 *
 * 用法：
 *   SHARP_REQUIRE_BASE=<含 sharp 的目录> node tools/gen-icons.mjs
 *   node tools/gen-icons.mjs --check      # 只校验已有图标的规格，不写盘
 */

import { createRequire } from "node:module";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function loadSharp() {
  const bases = [
    join(repoRoot, "package.json"),
    process.env.SHARP_REQUIRE_BASE ? join(process.env.SHARP_REQUIRE_BASE, "package.json") : undefined,
  ].filter(Boolean);
  let lastError;
  for (const base of bases) {
    try {
      return createRequire(base)("sharp");
    } catch (error) {
      lastError = error;
    }
  }
  throw new Error(
    `sharp 无法解析。设置 SHARP_REQUIRE_BASE 指向含 sharp 的目录后重试。(${lastError?.message ?? "unknown"})`,
  );
}

const INK = "#1FA463"; // 默认主色，逐个覆盖
const S = 9; // 线宽

/** 描边图形（统一 no-fill），返回 <g> 包裹的 path 集合。 */
function strokes(color, dList, width = S) {
  return `<g fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${dList
    .map((d) => `<path d="${d}"/>`)
    .join("")}</g>`;
}

function dots(color, points, r = 5.5) {
  return points.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${color}"/>`).join("");
}

function svg(body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${body}</svg>`;
}

/** 右下角箭头（从朝向 + 箭头头），避免每处手算角度。 */
function arrowUpRight(color, x1, y1, x2, y2, head = 14) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  // 箭头头：从终点往回两条，左右各偏 30°
  const a = (Math.PI / 6) * 1;
  const rot = (vx, vy, ang) => [vx * Math.cos(ang) - vy * Math.sin(ang), vx * Math.sin(ang) + vy * Math.cos(ang)];
  const [l1x, l1y] = rot(-ux, -uy, a);
  const [l2x, l2y] = rot(-ux, -uy, -a);
  return strokes(color, [
    `M ${x1} ${y1} L ${x2} ${y2}`,
    `M ${x2} ${y2} L ${(x2 + l1x * head).toFixed(1)} ${(y2 + l1y * head).toFixed(1)}`,
    `M ${x2} ${y2} L ${(x2 + l2x * head).toFixed(1)} ${(y2 + l2y * head).toFixed(1)}`,
  ]);
}

// ── 逐插件图标定义 ─────────────────────────────────────────────────────────
// 每个都是「一眼能认出这是干什么的」的单一概念；刻意让 9 个各有不同的主图形，
// 避免出现两个都像"放大镜 + 方框"的图标。

const ICONS = {
  // 安卓机器人头（含触角与双眼）—— 安卓逆向
  "android-reverse": () => {
    const c = "#1FA463";
    return svg(
      strokes(c, ["M30 90 V64 a34 34 0 0 1 68 0 V90 Z", "M46 32 L37 20", "M82 32 L91 20"]) +
        dots(c, [
          [52, 66],
          [76, 66],
        ]),
    );
  },

  // 左向箭头（reverse）+ 代码括号（engineering）
  "reverse-engineering": () => {
    const c = "#2F6FDB";
    return svg(
      strokes(c, [
        "M104 28 H44",
        "M58 15 L40 28 L58 41",
        "M56 54 L44 70 L56 86",
        "M72 54 L84 70 L72 86",
      ]),
    );
  },

  // CPU 芯片（外框 + 引脚）+ 内部指令行
  "asm-analysis": () => {
    const c = "#E0533D";
    return svg(
      strokes(c, [
        "M44 34 H84 A10 10 0 0 1 94 44 V84 A10 10 0 0 1 84 94 H44 A10 10 0 0 1 34 84 V44 A10 10 0 0 1 44 34 Z",
        "M48 34 V22",
        "M64 34 V22",
        "M80 34 V22",
        "M48 94 V106",
        "M64 94 V106",
        "M80 94 V106",
        "M34 48 H22",
        "M34 64 H22",
        "M34 80 H22",
        "M94 48 H106",
        "M94 64 H106",
        "M94 80 H106",
      ], 7) + strokes(c, ["M46 52 H82", "M46 64 H74", "M46 76 H62"], 7),
    );
  },

  // 六边形（二进制/十六进制）+ 放大镜（分析）
  "ida-reverse": () => {
    const c = "#7A4FD6";
    return svg(
      strokes(c, [
        "M94 54 L75 87 L37 87 L18 54 L37 21 L75 21 Z",
        "M108 108 L117 117",
      ]) + strokes(c, ["M96 96 m-16 0 a16 16 0 1 0 32 0 a16 16 0 1 0 -32 0"]),
    );
  },

  // 地球（经线 + 赤道）+ 花括号（Web 代码）
  "web-reverse": () => {
    const c = "#0EA5B7";
    return svg(
      strokes(c, [
        "M22 64 H106",
        "M22 64 a42 42 0 1 0 84 0 a42 42 0 1 0 -84 0",
        "M58 46 C50 48 54 62 48 64 C54 66 50 80 58 82",
        "M70 46 C78 48 74 62 80 64 C74 66 78 80 70 82",
      ]),
    );
  },

  // 四格窗（Windows）+ 右下角准星（逆向/分析目标）
  "win-reverse": () => {
    const c = "#0F766E";
    return svg(
      strokes(c, [
        "M36 24 H92 A12 12 0 0 1 104 36 V92 A12 12 0 0 1 92 104 H36 A12 12 0 0 1 24 92 V36 A12 12 0 0 1 36 24 Z",
        "M64 24 V104",
        "M24 64 H104",
      ], 8) + strokes(c, ["M84 84 m-13 0 a13 13 0 1 0 26 0 a13 13 0 1 0 -26 0", "M84 66 V102", "M66 84 H102"], 7),
    );
  },

  // 断裂的链环（linker）+ 向右上脱离的箭头（unwrap）
  "linker-fake-load-unwrapper": () => {
    const c = "#B45309";
    return svg(
      strokes(c, [
        // 左环：缺口朝右
        "M70.4 53.1 A 26 32 0 1 0 70.4 74.9",
        // 右环：缺口朝左
        "M57.6 53.1 A 26 32 0 1 1 57.6 74.9",
      ], 8) + arrowUpRight(c, 88, 44, 112, 20, 15),
    );
  },

  // 锯齿波 → 平滑波（去混淆）
  "xigong-funk-hikari": () => {
    const c = "#C026D3";
    return svg(
      strokes(c, [
        "M12 64 L22 42 L32 86 L42 46 L52 82 L62 50 L70 64",
        "M70 64 C 78 44 86 44 94 64",
        "M94 64 C 102 84 110 84 118 64",
      ]),
    );
  },

  // 盒子 + 被掀起的壳层（脱壳）
  "yingan-tuoxiu": () => {
    const c = "#DC2626";
    return svg(
      strokes(c, [
        "M30 58 V100 A8 8 0 0 0 38 108 H90 A8 8 0 0 0 98 100 V58",
        "M30 58 L52 32 H118 L98 58 Z",
        "M60 76 H68",
      ], 8) + arrowUpRight(c, 96, 44, 116, 24, 14),
    );
  },
};

// ── 运行 ───────────────────────────────────────────────────────────────────

const checkOnly = process.argv.includes("--check");
const sharp = loadSharp();

let failures = 0;
const rows = [];

for (const [plugin, build] of Object.entries(ICONS)) {
  const outPath = join(repoRoot, "plugins", plugin, "icon.png");
  let buf;
  if (checkOnly) {
    if (!existsSync(outPath)) {
      rows.push([false, plugin, "icon.png 不存在"]);
      failures += 1;
      continue;
    }
    buf = readFileSync(outPath);
  } else {
    buf = await sharp(Buffer.from(build()), { density: 384 }).resize(128, 128).png().toBuffer();
    writeFileSync(outPath, buf);
  }

  const meta = await sharp(buf).metadata();
  // 机械自检：尺寸/透明通道/不是空图也不是满图。看不见图的时候，这几个数字是唯一抓手。
  const { data, info } = await sharp(buf).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  let ink = 0;
  let minX = info.width;
  let minY = info.height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i + 3] > 16) {
      ink += 1;
      const p = i / info.channels;
      const x = p % info.width;
      const y = Math.floor(p / info.width);
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  const coverage = ink / (info.width * info.height);
  const problems = [];
  if (meta.width !== 128 || meta.height !== 128) problems.push(`尺寸 ${meta.width}x${meta.height}`);
  if (!meta.hasAlpha) problems.push("无透明通道");
  if (coverage < 0.03) problems.push(`墨迹过少 ${(coverage * 100).toFixed(1)}%`);
  if (coverage > 0.55) problems.push(`墨迹过多 ${(coverage * 100).toFixed(1)}%`);
  if (minX <= 1 || minY <= 1 || maxX >= info.width - 2 || maxY >= info.height - 2) problems.push("图形贴边（可能被裁切）");
  rows.push([
    problems.length === 0,
    plugin,
    `128x128 alpha=${meta.hasAlpha} 墨迹=${(coverage * 100).toFixed(1)}% 包围盒=[${minX},${minY},${maxX},${maxY}] ${problems.join("; ")}`,
  ]);
  if (problems.length > 0) failures += 1;
}

for (const [ok, plugin, detail] of rows) console.log(`${ok ? "PASS" : "FAIL"}  ${plugin.padEnd(30)} ${detail}`);
console.log(`\n${rows.length - failures}/${rows.length}${checkOnly ? "（--check，未写盘）" : " 已写入"}`);
process.exit(failures === 0 ? 0 : 1);
