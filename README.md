# 玩剧 Wanju Studio

通过对话完成视频创作，在本地工作台审阅剧本、分镜、素材和时间线。

玩剧是基于 [OpenFilm](https://github.com/openfilm/openfilm) 的独立改造项目，不代表上游官方发行版。
保留 OpenFilm 原生文件格式、编辑器、MIT 许可证和商标说明。

## 功能

- 原生时间线编辑、预览、撤销与本地导出。
- TXT、Markdown、DOCX 和文本型 PDF 导入，小说与分集工作台。
- 口播逐词时间复核和粗剪建议；跨轨联动素材不会被静默拆开剪切。
- 外部创作代理、本地供应商配置，以及可选的玩剧账号和云项目同步。
- 代码动画风格索引；素材使用单独的许可和署名，见第三方说明。

扫描型 PDF OCR、自动跨轨同步粗剪和真实供应商质量验收不在当前完成范围内。
在线模型和云服务可能产生费用；公开源码不代表第三方服务免费。

## 下载

Windows x64 安装包通过本仓库的 Releases 发布。2.1.0 的正式签名发布尚待签名服务审核和真实构建验收。
请核对每个 Release 中的签名状态和 SHA-256；不要把待签名构建当成正式签名版。

## 从源码构建

需要 Windows x64、Node.js 24、pnpm 9.15.9、Git，以及包含 `bin/ffmpeg.exe` 和 `bin/ffprobe.exe` 的 FFmpeg 目录。

```powershell
pnpm install --frozen-lockfile
$env:WANJU_FFMPEG_DIR = 'C:\Tools\ffmpeg'
node apps/desktop/scripts/release-wanju.mjs --version=2.1.0 --signing=none --output=build/wanju-2.1.0
```

构建使用锁定的 pnpm 9；也可用 `WANJU_PNPM_CLI` 指定实际安装的 `bin/pnpm.cjs`。
没有本地开发者配置也能构建；私密配置、项目、密钥和运行日志不会进入安装包。

## 测试与贡献

参见 [贡献指南](CONTRIBUTING.md)、[安全政策](SECURITY.md)、[隐私政策 / Privacy Policy](PRIVACY.md) 和 [构建与签名说明](docs/opensource/BUILDING.md)。
本仓库是筛选后的源码快照，不包含部署者的本地运维提交记录；来源与文件摘要见 `SOURCE-SNAPSHOT.json`。

## Code signing policy

目前正在准备申请 SignPath Foundation；尚未获批，尚未取得其签名，不宣称获得背书。
只有可信 GitHub-hosted 构建、批准的签名配置，以及通过发行者和时间戳验证的文件，才允许进入正式签名 Release。
作者、审阅者和签名批准者由仓库维护者配置；未完成配置时签名发布保持禁用。
详见 [签名政策](docs/opensource/CODE_SIGNING.md)。

## 许可

本项目源代码遵循 [MIT](LICENSE)，上游版权声明原样保留。OpenFilm 名称和标志受其 [商标说明](TRADEMARK.md) 约束。
风格素材、字体、第三方库和外部工作流不得一概视作项目原创或统一改标 MIT：
请阅读 [第三方说明](packages/openfilm/THIRD_PARTY_NOTICES.md) 和各素材目录内的许可。
