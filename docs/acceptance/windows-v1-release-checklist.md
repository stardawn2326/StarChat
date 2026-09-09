# Windows V1 RC 发布验收清单

## 自动化门禁

- [ ] `pnpm install --frozen-lockfile`
- [ ] `pnpm run typecheck`
- [ ] `pnpm run verify:test-manifest`
- [ ] 常规测试、Git runner 测试、brand migration 测试
- [ ] `pnpm run package:win`
- [ ] 生成 portable EXE、`SHA256SUMS.txt`、`release-manifest.json`

## Windows 手工验收

- [ ] 启动默认打开工作台；主窗口最大化 / 还原可重复切换
- [ ] 工作台人物窗口可拖动、可跟随光标；弹出桌宠后工作台人物消失
- [ ] 桌宠右键或托盘菜单可放回工作台
- [ ] 设置页与工作台共用两层结构、字号和卡片密度
- [ ] 右侧栏和底部栏默认折叠，按需展开
- [ ] Live2D 真实模型加载、表情、动作、参数和 Lip-sync
- [ ] 透明窗口、缩放、跨显示器、休眠恢复

## 发布信息

- 产物：`outputs/StarChat-<version>-win-x64-portable.exe`
- 签名：RC 阶段未配置代码签名证书，`signed=false`
- 手工验收状态：待目标 Windows 环境执行
