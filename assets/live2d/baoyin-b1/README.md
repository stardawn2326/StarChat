# 白音 B1 Live2D 制作包

## 当前状态

这是 B1 正式服装的制作包和契约目录，不是已完成的 Cubism 模型。当前已放入：

- `layer-manifest.json`：分层命名与对象树。
- `parameter-manifest.json`：标准参数、Deformer 和物理组。
- `semantic-mapping.json`：12 个表情、8 个动作的暂定语义映射。
- `export-manifest.json`：运行时导出文件契约。
- `qa/`：模型完成后使用的截图与检查结果目录。

当前制作优先级：先完成并验收 Photoshop 正式分层原画；Cubism 绑定、物理和 runtime 导出暂缓。正式画布基线为 `4096 × 6144 px`、RGB/8-bit、透明背景、自然正面全身站姿，详细规格见 `docs/Live2D-B1分层与参数规范-2026-08-21.md`。

正式重绘基准：`../../character/白音-B1-Live2D三视图.png` 左侧正视图。它负责锁定正面人体比例、轮廓、发型和 B1 不对称裙摆；`../../character/白音-B1-月之术师幻想装.png` 与 `../../character/白音-B1-服装配饰拆解.png` 负责核对材质、装饰和可独立拆分部件。`source/baoyin-b1-front-concept-v003.png` 与 `v004.png` 是已否决的历史校准草稿，只作审计记录，不是设计权威、分层源或 Cubism 输入。

`source/baoyin-b1-front-v001.psd` 已真实生成，但首轮视觉验收不通过，当前仅作为失败快照保留，不得作为正式交付或 Cubism 导入源。失败原因：艺术风格和人体比例明显偏离 B1 参考，部件细节过度简化，实际有内容的独立部件不足以覆盖规范要求，且 SVG 置入流程曾产生矩形背景污染。

正式源文件应放在：

- `source/baoyin-b1-front-v001.psd`：Photoshop 分层源；版本号递增，不覆盖唯一源。
- `source/baoyin-b1.cmo3`：Cubism 工程；每次绑定阶段另存版本。
- `textures/`：Cubism 导出纹理。
- `runtime/`：`.model3.json`、`.moc3`、`physics3.json`、表达式、动作等导出物。

`qa/baoyin-b1-reference-review-v001.psd` 已真实存在，但它是单层扁平参考快照，仅用于留档和视觉比对，不能作为正式源文件或 Cubism 导入源。`qa/baoyin-b1-front-v001-static-composite.png` 是失败版本的视觉证据，不是通过证据。

## 输入参考

输入参考仍保留在项目的 `assets/character/`，包括 B1 主服装、三视图、表情板、动作板和配饰拆解。参考图是视觉基准，不应直接作为可动层。

## 完成判定

只有当 PSD、`.cmo3`、runtime 导出物和 `qa/` 中的正面/转头/眨眼/嘴型/呼吸/物理/表情切换证据都存在并通过人工检查，才可把 `export-manifest.json` 的状态改为 `verified`。
