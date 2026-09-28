# Captcha / Slider Playbook（滑块 / 点选 / 旋转验证码）

Version: 2

> **何时读我**：`challenge-orchestration` 命中 **visual challenge**——目标是滑块/点选/旋转验证码时。复杂多步挑战先在 `challenge-orchestration-playbook.md` 建好状态机，再进本文做密文还原。
> **配套脚本**：`scripts/captcha/slide-gap.py`（缺口识别）、`scripts/captcha/track-gen.py`（轨迹）、`scripts/captcha/geetest-w.py`（w 参数）。

## 〇、挑战先被真实交互触发

1. **行为式挑战**（滑块/点选/旋转等一切依赖人类手势的 challenge）的请求链由真实指针事件驱动（down→move→up）——**没有交互就没有后续密文请求，被动观测/等待不会触发**。
2. **先以页面 DOM 结构与交互提示判形态**（直滑 / 拼图缺口 / 点选 / 旋转），**不得以搜索结果标题定形态**——公开资料常混用旧版形态（如把直滑滑块称作"拼图"）。
3. **交互手段梯度**：优先经锁定 MCP 的 CDP 透传发 Input 事件；锁定工具确无输入面时，允许页面合成 PointerEvent **用于触发采集链**，但报告须标注 isTrusted 局限、真实轨迹参数以浏览器端成功样本为准。
4. **先真实通过一次挑战**、成功轨迹参数留档 `run/`，再进抓包与协议还原。

## 一、通用流程（全平台一致）

```
0. 真实触发挑战（见 §〇：判形态 → 真实交互通过一次 → 成功样本留档）
1. 抓包建图谱（记录完整请求序列）——并落进 run/challenge-state-machine.json；
   先自问状态机最小三问：挑战类型判定依据？触发入口在页面哪个动作？成功回调字段是什么？
   （复杂多步挑战再按 challenge-orchestration-playbook.md 建完整状态机）
   GeeTest v3: gettype → get(图) → ajax(空滑块) → ajax(带w)
   GeeTest v4: load → verify  | 易盾: getconf→up→get→check | 数美: captcha→verify
2. 定位密文参数（通常 1~2 个）
3. XHR 断点 → 调用栈回溯 → 找参数赋值行
4. 识别加密算法（见 §二）
5. 还原底图 → 识别缺口 → 生成轨迹 → 构造密文 → 提交
```

验收口径：**端到端服务端返回成功**（求解器实际通过、`error==0` 且业务校验通过），不是"格式被接受"。
对应 SKILL.md 模式 A 红线——由 `run/verify-once.mjs` 复现，未复现前 claimLevel 最高 `provisional`。

## 二、各平台加密差异

| 平台 | 加密方式 | 关键参数 | 公开资料关键词 |
|------|---------|---------|--------------|
| GeeTest v3/v4 | AES-CBC + RSA-PKCS1v15 | `w` = AES(payload) + RSA(key) | geetest / gt |
| 数美 | DES-ECB + ZeroPadding | `gg`=DES(距离), `hg`=DES(轨迹) | shumei / ishumei |
| 顶象 | btoa(拼接字段) | `ac` = btoa(多字段) | dingxiang / dx |
| 百度旋转 | AES-ECB 双层 | key 由接口 `as` 末位字符 hash 派生 | baidu rotate |
| 易盾 | 自定义 RSA + AES | `d` 字段多层加密 | yidun / dun163 |
| 阿里系验证码（afs/nocaptcha/aliyun-captcha） | 自研引擎加密上报，现场分析 | —（行为加密块需现场还原） | `nocaptcha` / `afs` / `aliyun-captcha` ｜样本来源：单站点实测，细节需现场核验 |

## 三、GeeTest w 参数结构

```python
# w = AES_CBC(payload) + RSA_PKCS1(aes_key)
# AES: CBC, IV=b'\x00'*16, PKCS7, 输出 hex
# RSA: n=0x00C1E3934D1..., e=0x010001
# ⚠ 以下 n 值为样本实测值（GeeTest v3 某站点实测；换站必变，现场重测）
# 关键：同一次验证流程所有请求共用同一个 key，扣代码时只生成一次！
import random
def gen_key(): return ''.join(hex(random.randint(0,15))[2:] for _ in range(16))
```
完整 AES+RSA 实现见 `scripts/captcha/geetest-w.py`（n 与 payload 需按目标站点扣取替换）。

## 四、GeeTest v3 底图还原（固定乱序数组）

```python
# ⚠ Ut 乱序数组为样本实测值（GeeTest v3 某站点实测；换站/换版本必变，现场重测）
Ut = [39,38,48,49,41,40,46,47,35,34,50,51,33,32,28,29,27,26,36,37,
      31,30,44,45,43,42,12,13,23,22,14,15,21,20,8,9,25,24,6,7,3,2,
      0,1,11,10,4,5,19,18,16,17]
def restore(img):
    s = Image.new("RGBA", (260, img.height)); a = img.height // 2
    for idx, val in enumerate(Ut):
        c = val % 26 * 12 + 1; u = a if val > 25 else 0
        s.paste(img.crop((c, u, c+10, u+a)), (idx%26*10, a if idx>25 else 0))
    return s
# 定位还原代码：Event Listener Breakpoints → Canvas → Create canvas context
```

## 五、缺口识别

```python
import cv2
def get_gap(bg, slide):
    r = cv2.matchTemplate(cv2.Canny(cv2.imread(bg,0),100,200),
                          cv2.Canny(cv2.imread(slide,0),100,200), cv2.TM_CCORR_NORMED)
    return cv2.minMaxLoc(r)[3][0]
# 或 ddddocr：det.slide_match(slide_bytes, bg_bytes, simple_target=True)['target'][0]
```
脚本：`python scripts/captcha/slide-gap.py bg.png slide.png`（自动选 ddddocr，回退 OpenCV）。

## 六、轨迹生成

```python
import math, random
def ease_out_expo(t): return 1 - math.pow(2, -10*t)
def gen_track(distance):
    track, t = [], 0
    for i in range(100):
        track.append([int(distance*ease_out_expo(i/100)), 0, t]); t += random.randint(7,17)
    return track
# 三段式：加速(70%) → 超冲 → 回撤(-1~-2px) → 对齐
# ⚠ scale/offset 修正系数为样本实测值（某站点页面缩放实测；换站必变，现场重测）
# 自动化时距离需除以页面缩放比(约/1.97)再减初始偏移(约30px)
```
脚本：`python scripts/captcha/track-gen.py <距离> --scale 1.97 --offset 30`。

## 七、验证码识别方案

| 类型 | 方案 |
|------|------|
| 滑块缺口 | cv2 Canny+matchTemplate 或 ddddocr.slide_match |
| 旋转 | `rotate-captcha-crack` |
| 文字点选/九宫格 | ResNet18 特征+余弦相似度（约 500 样本起） |
| 算术/字符 OCR | ddddocr |

## 八、常见坑

- 同一 key 复用：GeeTest 同流程多个 w 共用 AES key，只生成一次
- challenge 混用：rp 用图片接口返回的 challenge，非 gettype
- 图片缩放：易盾背景 480px 计算时需 resize 到 420px（⚠ 样本实测值，换站必变，现场重测）
- 动态时间戳 `?cdnversion=xxx` 无法断点 → DevTools Overrides 重写 URL
