# 安全策略

## 支持的版本

| 版本 | 支持状态 |
| --- | --- |
| main 分支最新 | ✅ 积极维护 |
| 更早的 commit | ⚠️ 不保证修复，建议升级 |

## 报告漏洞

如果你发现了安全问题，**请不要** 直接开公开 Issue。
请通过 [GitHub Security Advisories](https://github.com/TPF-tian/tool-box/security/advisories/new) 私下报告，并附上：

- 漏洞描述与影响范围
- 复现步骤 / PoC
- 受影响版本
- 你的修复建议（可选）

我会在 7 天内回复并评估。

## 安全设计

ToolBox 的核心定位是 **数据不出浏览器**：

- 除 IP 解析（[ipwho.is](https://ipwho.is) 公共 API）外，所有图像/文档处理都在浏览器内完成
- 没有任何用户数据收集或上报
- 文件不上传到任何服务器（除非用户主动使用证件照功能连接自托管的 AI 抠图后端）

部署自托管 AI 服务（证件照功能）时请确保：

- 仅绑定 `127.0.0.1`，对外通过 nginx 反代
- 加上请求大小限制（已默认 20MB）
- 加 IP 限流（避免被恶意刷爆 CPU）

详细见 `deploy/README.md`。
