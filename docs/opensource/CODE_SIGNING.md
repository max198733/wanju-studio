# Code signing policy

状态：准备申请，尚未获 SignPath Foundation 接受，尚未取得 Foundation 签名。
不能使用已经获得免费签名的宣传措辞。

## 申请前必须披露

- 玩剧独立改造自 OpenFilm，保留上游源码、MIT 和商标声明。
- 当前动画风格合集有“免费分享、不得作为收费技能或课程销售”的独立条款，不能将整个合集标为 OSI 开源许可。
- 附带工作流与代理依赖的授权、上游签名分支和派生项目关系仍需逐项核对，不能直接承诺符合 Foundation 资格。
- 第三方模型、账号和云存储可能收费。应用保留本地编辑、导出与用户自行选择供应商的入口。
- 云登录、上传、模型请求的网络数据流应在隐私政策中说明，不能声称所有使用情形都不会发送数据。

## 获批后

由真实维护者在 GitHub 和 SignPath 中配置作者、审阅者和批准者；所有人启用 MFA。
只允许 GitHub-hosted 构建，审查构建脚本、依赖锁定和工作流的变更。
只有经批准的源代码构建可以签名；每次签名需要人工批准。不要将自动批准设置作为规避审核的方式。

签名策略必须限制 ProductName 为玩剧、ProductVersion 为当前版本，并仅接受构建中的 Wanju 可执行文件。
签名桥通过 GitHub Artifact 提交源自当前 workflow 的文件，不接受本机上传的任意二进制冒充公开构建。
主程序、安装器、卸载器均需取得签名；第三方程序保留自身原始签名与许可。

## 发布验证

检查 Authenticode 的状态、完整发行者 Subject 和时间戳。签名后重新计算 SHA-256。
失败时停止生成签名 Release。草稿经维护者检查后才公开。
GitHub 托管、哈希校验、构建来源证明和 Windows 代码签名是不同的验证，不相互冒充。

官方依据：

- https://signpath.org/terms.html
- https://signpath.org/apply.html
- https://docs.signpath.io/trusted-build-systems/github
- https://www.electron.build/code-signing-win.html
