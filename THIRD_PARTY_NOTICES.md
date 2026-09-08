# StarChat 第三方组件声明

本仓库的 Windows 构建会随应用打包 Live2D Cubism Web Core。该组件不是 StarChat 自有代码，使用、分发和商业发布必须以随附的上游授权文本为准。

## Live2D Cubism Web SDK

- 组件：Live2D Cubism Core for Web 与 Cubism Web Framework。
- 代码位置：`code/vendor/live2d-sdk-web/Core/`、`code/vendor/live2d-sdk-web/Framework/`。
- 上游许可证：[`code/vendor/live2d-sdk-web/LICENSE.md`](code/vendor/live2d-sdk-web/LICENSE.md)。
- Core 许可证副本：[`code/vendor/live2d-sdk-web/Core/LICENSE.md`](code/vendor/live2d-sdk-web/Core/LICENSE.md)。
- 上游声明：[`code/vendor/live2d-sdk-web/NOTICE.md`](code/vendor/live2d-sdk-web/NOTICE.md)。
- Core 文件中的许可证标头和上游版本信息应与上述文本一起保留。

## 发布前检查

1. 不要把外部 Live2D 模型、人物素材或模型授权误认为本仓库授权；模型源文件仍由用户自行提供并在应用外部只读引用。
2. 发布前复核当前 Live2D SDK 版本、Core/Framework 的授权范围和商业发布条件。
3. 发布包必须继续包含应用所需的 Core 文件以及对应的许可证/声明材料；签名状态不改变第三方授权义务。

该文件是仓库级索引，不替代上游许可证、NOTICE 或法律意见。
