# 构建与发布

## 2.1.0

正式签名包待 SignPath 审核。源码准备、未签名构建、签名成功、GitHub 草稿和正式发布分别记录，不互相替代。
普通源码推送只运行检查。Windows 构建需维护者手动触发，默认 `signing: none`，仅保存构建产物，不创建 Release。
`signing: signpath` 会在凭证或发行者配置缺失时停止；签名与验签完成后才创建新的 Release 草稿，不覆盖已发布版本。

## 本机构建

安装 Node.js 24.19.0、pnpm 9.15.9、Git 和 FFmpeg 9.0.2。运行 `pnpm install --frozen-lockfile`。
Windows 构建需要 Edge；也可自行提供 Playwright 的浏览器支持。主机不要求存在开发者的 `.local` 配置。

```powershell
$env:WANJU_FFMPEG_DIR = 'C:\Tools\ffmpeg-9.0.2-essentials_build'
node apps/desktop/scripts/release-wanju.mjs --version=2.1.0 --signing=none --output=build/wanju-2.1.0
node scripts/wanju-release-manifest.mjs --directory=build/wanju-2.1.0 --version=2.1.0
```

GitHub 使用官方 Gyan FFmpeg 压缩包及已核对的 SHA-256；项目打包复制其 GPL v3 文本与来源 README。
FFmpeg 以独立进程运行，不能把其二进制重新声明为 MIT。源码位置和构建配置在该发行包 README 中。

## GitHub 设置

维护者先启用 MFA，再创建 `wanju-release` Environment，将允许部署的分支限制为默认分支。
SignPath 获批后，在该 Environment 中添加：

| 类型 | 名称 | 内容 |
| --- | --- | --- |
| Secret | `SIGNPATH_API_TOKEN` | SignPath 提交令牌，只授予对应项目的提交权限 |
| Variable | `SIGNPATH_ORGANIZATION_ID` | 审核通过的组织 ID |
| Variable | `SIGNPATH_PROJECT_SLUG` | 项目标识 |
| Variable | `SIGNPATH_SIGNING_POLICY_SLUG` | 要求维护者批准的签名策略 |
| Variable | `SIGNPATH_ARTIFACT_CONFIGURATION_SLUG` | ZIP 中单个 Wanju PE 文件的配置 |
| Variable | `WANJU_SIGN_EXPECTED_SUBJECT` | 已批准证书的完整 Subject，按实际证书填写 |

构建先生成公开可追溯的 GitHub Artifact，再调用固定提交版本的 SignPath 官方实现。
只签署玩剧主程序、安装器和卸载器，不以本项目证书重新签署 Electron、FFmpeg 或其他上游程序。
每次返回的文件必须具有 `Valid` 签名、时间戳和预期发行者；最后重新检查主程序与安装包。

公开构建尚未在真实 GitHub Runner 上运行前，不能声称云构建已验收。签名接入尚未获批并实际完成前，不能声称签名流程端到端通过。

申请资料草稿见 [SIGNPATH_APPLICATION.md](SIGNPATH_APPLICATION.md)。由维护者本人确认身份、许可和条款后提交。

## 外部代理接入

`integrations/agent/mcp-config.json` 使用 PATH 中的 `node` 和仓库相对路径。
将客户端的工作目录设为仓库根目录；不支持配置工作目录的客户端，应将 `args` 中的
`integrations/agent/server.mjs` 改为本机该文件的绝对路径。公开配置不包含开发者电脑路径或密钥。
