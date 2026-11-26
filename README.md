# 心图 CardioAtlas · V9 Teaching Edition

**心脏解剖交互教学系统 / Interactive Cardiac Anatomy Atlas**

> 一颗心，一张可探索的解剖地图。  
> Every chamber, a story.

本项目是基于 BodyParts3D 真实解剖几何整理、修复和重建的离线心脏解剖学习工具，包含 50 个当前保留结构、56 个爆炸单元、结构知识库、四腔内部视图、透明、三轴剖切和单结构/单系统聚焦。

> **教学演示用途，不用于诊断、手术规划或临床决策。医学内容仍为 PENDING（待专业审核）。**

---

## 直接打开

- **V9 离线单文件**：[`assets/v9/final/cardiotwin-final-v9.html`](assets/v9/final/cardiotwin-final-v9.html)
- **V9 模型**：[`assets/v9/final/cardiotwin-heart-final-v9.glb`](assets/v9/final/cardiotwin-heart-final-v9.glb)
- 双击 HTML 即可通过 `file://` 打开，模型与纹理均内联，不依赖服务器。

模型 SHA-256：

```text
e11d9f2ac167291ca08f3f3d2bd53902ff7dc701c00bfdf32f2fa4db15f78bad
```

---

## 当前内容

| 项目 | 内容 |
|---|---|
| 保留结构 | 50 |
| 爆炸单元 | 56（50 结构 + 6 系统组） |
| 几何 | 50 个独立 Mesh，含轻度平滑 |
| 材质 | BaseColor / Normal / Roughness / AO，节段组织色 |
| 知识库 | 50 条结构知识，每条含位置、功能、关系、临床、自测 |
| 交互 | 点击拾取、高亮、结构索引、搜索、隐藏、隔离 |
| 分组 | 心肌 / 心腔 / 瓣膜 / 乳头肌 / 大血管 / 冠状动脉，每组全选/全关 |
| 四腔 | L2 / 四腔内部视图，LA/RA/LV/RV 标签与血流方向示意 |
| 爆炸 | L1/L2/L3、单结构、单系统、暂停、速度、恢复 |
| 剖切 | X/Y/Z 手动剖切；内部/四腔使用独立 section，状态互斥 |
| 光照 | 屏幕固定左上主光、PCFSoft 阴影；无展示平台 |
| 运行 | 离线单文件，零外部请求 |

---

## 已知限制

- R14 的**真实非凸 Earcut 封口**仍未完成；当前不闭合截面保持开放，不使用凸包 fallback。
- L3 全结构爆炸时，全部结构同时显示会缩小单个结构；后续应做按系统巡检相机。
- 四腔血流路径为教学示意，不是流体仿真。
- 医学内容未经专业医学审核签字。
- 8 个未勾选结构已从 V9 中删除：左右心房腔面、降胸主动脉、头臂干、左颈总动脉、左锁骨下动脉、头臂静脉汇合、LCX 钝缘支。

---

## 源码与重建

- V9 页面源码：[`src/v9/final.ts`](src/v9/final.ts)
- 知识库：[`src/v9/Knowledge.ts`](src/v9/Knowledge.ts)
- 爆炸布局：[`src/v9/ExplodeLayout.ts`](src/v9/ExplodeLayout.ts)
- 页面模板：[`src/v9/final.html`](src/v9/final.html)

重建页面需要 Node.js、pnpm/npm 与项目已安装依赖：

```powershell
npx esbuild src/v9/final.ts `
  --bundle --format=iife --platform=browser --minify `
  --loader:.glb=base64 --outfile=src/v9/final-bundle.js
```

将生成的 bundle 注入 `src/v9/final.html` 的 `/*__BUNDLE__*/` 位置，即可得到新的离线页面。

---

## 目录

```text
assets/v9/final/            V9 GLB、离线 HTML、截图、配置与报告
assets/v9/working/          四腔显示用腔面资源
src/v9/                     V9 Three.js 源码与知识库
scripts/                    构建/检查辅助脚本
```

---

## 版权与使用限制

本项目为专有教学项目，**未经书面授权，禁止复制、商用、售卖、分发、改编或用于模型训练**。

- [免责声明](DISCLAIMER.md)
- [专有许可说明](LICENSE)

第三方几何与开源库仍受其各自许可证约束。BodyParts3D 数据来源与许可见项目内相关文档。

---

## 联系

CardioAtlas / 心图  
教学演示版本 · V9 Teaching Edition
