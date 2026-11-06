# SignPath Foundation 申请草稿

状态：尚未提交，尚未获批。以下项目说明可供真实维护者核实后填写申请。
不能用本文件代替身份验证、许可确认、服务条款接受或审核结果。

## 项目资料

| 字段 | 待提交内容 |
| --- | --- |
| Project name | Wanju Studio / 玩剧 |
| Project website | 由维护者确认官网和公开仓库地址 |
| Source repository | https://github.com/max198733/wanju-studio |
| Maintainer / contact | 由维护者本人填写真实姓名、GitHub 账号及可联系邮箱 |
| Platform | Windows x64 |
| Version | 2.1.0 |
| Code license | MIT，保留 OpenFilm 原始版权声明 |
| Release history | 由维护者提供现有公开安装包和发布日期；本机待签名构建不能冒充已签名发布 |

## 英文项目说明

Wanju Studio is an independently maintained adaptation of OpenFilm for conversational video creation.
It retains the upstream file format, native timeline editor, MIT notices and trademark notices, while adding
Chinese-language workflows, document import, project review, optional account/cloud integration and local exports.
External AI providers and optional cloud services may charge users separately.

The source repository is a reviewed snapshot of the adaptation, with upstream attribution retained. It does not
include the developer's private operational history, credentials, customer data or personal projects.
The upstream relationship and the provenance of a published snapshot are documented in the repository.

## 必须主动披露的资格问题

- 这是 OpenFilm 的派生项目。需要审核方确认上游已签名构建、发布分支及派生关系方面的要求是否满足；
  不能将一份新建的源码快照描述为已满足所有 fork 要求。
- 应用包含混合来源的代码动画风格合集，其中部分文件只有免费分享及禁止打包收费的条款。
  这些条款不能统一视作 OSI 认可的开源许可，也不能以代码的 MIT 许可证替代。
- 何导工作流等随包内容需要维护者确认公开再分发授权。保留来源说明本身不等于取得授权。
- FFmpeg、Electron、字体和其他依赖保留各自许可。不能以玩剧证书重新签署供应商的程序。
- 申请是否符合 Foundation 资格尚不确定；若要求移除或替换非兼容素材，应在独立变更中审阅并测试。

## 拟采用的签名流程

Windows 构建在 GitHub-hosted runner 上执行，依赖和官方签名工具固定版本。
只提交从本次 GitHub 构建上传的 Artifact，只签署玩剧主程序、安装器和卸载器。
每次签名需要维护者在审核过的策略中批准；人员启用 MFA，仓库配置分支保护和发布环境。
验证发行者完整 Subject、可信 Authenticode 签名和时间戳后重新计算 SHA-256。
通过后只生成 Release 草稿，最终公开发布由维护者检查。

## 维护者完成项

1. 登录 GitHub，确认公开仓库所属账号，并启用 MFA。
2. 核实第三方内容的公开再分发许可，以及派生项目是否符合申请条件。
3. 将实际仓库地址、本人联系方式、现有发布记录和签名政策填入官方申请。
4. 本人阅读并接受官方条款后提交，不填写虚构团队成员或未经同意的联系方式。
5. 获批后配置项目、Artifact、人工批准策略、证书 Subject 和发布环境，再运行真实签名验收。

申请入口：https://signpath.org/apply.html
资格与条款：https://signpath.org/terms.html
