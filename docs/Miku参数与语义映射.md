# Miku 参数与语义映射

## 适配原则

导入器是通用外部 Cubism `model3` 适配层，不按 Miku 文件名写死动作，也不让人格/AI 事件直接写 Cubism 参数。它先读取 cdi3 的参数 ID 与名称，再读取 exp3 的实际 `Parameters`；只有参数标签和 exp3 值都能确认时才生成语义路由。未知模型或未确认的语义只返回 `neutral` 或空效果。

Miku 的具体 ID 只出现在本报告的实测证据中，不是导入器的固定条件。换用合法的 Cubism 3/4/5 model3 模型时，适配器会按新模型重新生成；如果新模型没有相应标签或资源，不会猜测。

## 标准参数适配

| 语义参数 | Miku 目标 ID | 用途 | 建议范围 |
| --- | --- | --- | --- |
| `head_x` | `ParamAngleX` | 头部左右 | -30…30 |
| `head_y` | `ParamAngleY` | 头部上下 | -30…30 |
| `head_z` | `ParamAngleZ` | 头部旋转 | -20…20 |
| `body_x` | `ParamBodyAngleX` | 身体左右 | -10…10 |
| `body_y` | `ParamBodyAngleY` | 身体上下/前后 | -10…10 |
| `body_z` | `ParamBodyAngleZ` | 身体旋转 | -10…10 |
| `eye_open_l` | `ParamEyeLOpen` | 左眼开闭 | 0…1 |
| `eye_open_r` | `ParamEyeROpen` | 右眼开闭 | 0…1 |
| `gaze_x` | `ParamEyeBallX` | 眼球左右 | -1…1 |
| `gaze_y` | `ParamEyeBallY` | 眼球上下 | -1…1 |
| `mouth_open` | `ParamMouthOpenY` | 嘴部张合/口型音量 | 0…1 |
| `mouth_form` | `ParamMouthForm` | 嘴型负/零/正形变 | -1…1 |
| `breath` | `ParamBreath` | 呼吸驱动 | 0…1 |
| `hair_front` | `ParamHairFront` | 前发物理输入/输出 | -1…1 |
| `hair_side` | `ParamHairSide` | 侧发物理输入/输出 | -1…1 |
| `hair_back` | `ParamHairBack` | 后发物理输入/输出 | -1…1 |

Miku 的 CDI3 参数表同时确认了 `ParamBrowLY`、`ParamBrowRY` 以及自定义的圈圈、脸红、QQ、前倾、大葱、唱歌、比心、水印参数。CDI3 未提供所有运行时参数的精确 min/max，因此表中的范围是适配器的安全建议值，不冒充 moc3 内部范围。

## 实际 exp3 语义结果

| 语义 | 分类 | 实际资源/参数效果 | 结果 |
| --- | --- | --- | --- |
| `neutral` | expression | 无资源，重置适配器触碰过的语义参数 | 安全基线 |
| `caring` / `caring_smile` | expression | 无原生文件；使用已存在的标准眼、眉、嘴参数安全组合 | 项目侧 preset |
| `blush` / `shy` | expression | `脸红.exp3.json`：`Param130=1` | 已由 JSON 效果确认 |
| `confused` / `circles` / `confused_blank` | expression | `圈圈.exp3.json`：`Param125=1` | 已由 JSON 效果确认 |
| `cry` / `QQ` / `sad` | expression | `QQ人.exp3.json`：`Param131=1`、`Param136=1` | 已由 JSON 效果确认 |
| `lean_forward` | action | `前倾.exp3.json`：`Param132=1` | 文件是 exp3，但按姿态动作分类 |
| `sing` / `singing` | action | `唱歌.exp3.json`：`Param134=1` | 已由 JSON 效果确认 |
| `heart` / `affection` | action | `比心.exp3.json`：`Param135=1` | 已由 JSON 效果确认 |
| `leek_prop` / `prop_fun` | action | `葱.exp3.json`：`Param133=1` | 已由 JSON 效果确认 |
| `watermark_on` | system | `水印.exp3.json`：`Param137=1` | 默认打开状态和 exp 效果已记录 |
| `watermark_off` | system | 没有独立 off.exp3 | 不提供绕过效果，安全回退 neutral |

`Scene1.motion3.json` 被解析为 motion3，报告了循环、时长、帧率和曲线 ID，但没有可靠的语义标签。导入器不会因为文件名叫 Scene1 就把它猜成 greeting、idle 或其他动作；当前真实 Cubism runtime 已能加载 model3 初始画面，但仍未把这个同目录 motion3 写回 model3.json 或接入语义播放器，因此播放、停止和中断仍需单独验证。

## AI 语义事件路由

当前安全路由为：

```text
greeting     -> neutral（没有可验证的 greeting motion 时）
caring      -> caring preset
shy         -> blush
confused    -> circles
sad         -> QQ
singing     -> sing
affection   -> heart
prop_fun    -> leek_prop
lean_forward -> lean_forward
```

AI 层只传这些语义名；适配器不接受 `set_arbitrary_cubism_parameter` 或任意原始 ID。语义切换先清理上一个语义触碰的参数，再应用当前已验证效果；未知语义和缺失资源均回退 `neutral`。纯状态层 50 次循环后没有残留参数，但这不是实际 renderer 的内存或视觉压力测试证据。

## 水印与发布

同目录许可说明确认水印默认打开，且水印资源没有被删除、覆盖或复制。当前静态层只记录 `watermark_on` 的自带 exp3 效果；不存在独立 `watermark_off` 资源时不会生成关闭水印的绕过参数。对外发布测试视频或截图前，必须署名“人物绘制：玄宝酱；人物建模：怂怂koe”，并遵守禁止商用、二传、二改和盈利直播的限制。

## 真实渲染追加状态（2026-08-21）

Web SDK 5-r.5 的 Core、Framework 已接入 Electron renderer。Miku 通过受限 `live2d://model/` 路径只读加载，模型自带水印在真实画面中可见；WebGL2 透明画布已验证。当前 PresentationBus 仍只驱动安全语义状态层和界面标签，尚未把每个语义事件逐个下发给 Cubism 模型，所以不能把初始画面证据当作 blush、circles、QQ、sing、heart、leek、lean-forward 或 watermark 切换均已视觉通过。
