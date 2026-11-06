# 玩剧 Wanju Studio 隐私政策 / Privacy Policy

生效及最近更新日期：2026 年 11 月 6 日。

本政策说明玩剧桌面客户端，以及维护者在 `wanju.kukukaka.cn` 提供的可选账号与云服务如何处理信息。维护者为 Ma Xin（GitHub：`max198733`），隐私事务联系邮箱为 **max198733@qq.com**。其他人部署的服务由其运营者负责，不能直接以本政策代替自己的说明。

本地编辑、云服务和外部 AI 服务有不同的数据流。公开源码不表示所有操作离线，也不表示第三方服务免费。政策的发布不代表既有安装包已经增加隐私提示、安装选项或新的安全功能；具体可用控制取决于使用的版本。

## 1. 本地项目与设备数据

导入、时间线编辑、预览和本地导出主要在设备上完成。项目目录及应用数据目录可能保存素材、项目文件、提示词、会话与工具记录、预览缓存和诊断日志。项目可能引用远程字体、图片、脚本或其他资源，预览这些内容时也可能联网。

仅使用本地功能不要求上传整个项目。你选择的外部创作代理可能有权限读取项目、执行工具和发起网络请求，其数据处理也受该代理及所连接服务的设置和政策约束。玩剧本地日志并不等于所有外部代理的遥测均被关闭。

## 2. 账号与服务运行

注册和登录会处理用户名、密码、账号标识、登录会话、账号状态及必要的服务记录。现有常规注册流程不要求提供邮箱或手机号；部分人工开通或历史入口可能接收你主动填写的联系方式、备注或激活码。

密码通过服务端校验并以加盐哈希保存；服务器保存会话令牌的哈希。桌面端保存登录凭据时，账号会话使用操作系统凭据保护；网页账号入口使用浏览器会话存储。部分其他本地供应商密钥设置在系统加密不可用时可能回退为本地文件存储，因此不能将所有本地设置都视作始终加密。

联网服务会处理请求时间、网络地址及必要的错误和安全信息，用于身份验证、限流、排障和防止滥用。登录状态、可用功能、余额或供应商配置查询可能在启动或刷新时发生，不限于每次点击生成之后。

## 3. AI 请求、供应商与计费

使用 AI 时，提示词、对话、选定的项目上下文、工具定义及结果，以及请求涉及的图片、音频、视频或文件链接，可能发送给所选服务。生成结果、任务标识和用量信息会返回客户端或网关。

使用玩剧账号的创作助手时，请求经玩剧服务转发给运营者配置的模型供应商。截至本次核对，官方账号服务使用 XEM 模型中转（<https://ai.xem8k5.top/>）；中转方还可能调用上游模型服务。尚未取得可核验的 XEM 独立隐私政策链接，提交敏感内容前请联系维护者确认处理安排。不能用某个模型品牌的政策替代中转方自己的处理说明。

自行配置供应商时，请求及必要的身份验证信息会发送至你配置的地址；该服务可能位于不同国家或地区。第三方是否留存内容、用于训练及如何删除数据，取决于你所使用的产品、账号协议和供应商政策，玩剧不能统一承诺“不留存”或“不训练”。

账号服务记录余额、账单、请求标识、状态、时间、模型或配置版本、用量和费用，以结算及核对异常。账单记录不以保存完整提示词为目的，但这不表示本地会话、服务诊断或外部供应商都不会留存内容。收费服务的价格与生成确认另行显示。

## 4. 可选云项目同步

登录并选择上传项目，或为项目开启自动云保存后，项目文件及标题、相对路径、大小、内容哈希、版本和时间信息会传至云端。开启自动保存后，后续变更可持续上传，直到暂停、关闭或退出相关账号。

上传范围可以包含项目目录中的多种文件，并非只包含时间线或画面素材。客户端会排除部分隐藏目录、常见凭据文件、日志和缓存，并拒绝符号链接，但这些规则不能识别所有敏感文件。上传前请检查项目目录，尤其是自行放入的私人资料或密钥。

云服务按账号控制访问，采用 HTTPS 传输；它不是端到端加密保险箱。服务运营者及必要的基础设施供应商可在提供服务、备份、安全调查或处理支持请求所需范围内接触数据。服务器和所选供应商的处理地点可能不同，本政策不承诺所有数据仅在中国境内处理。

删除本地文件不会自动删除云端副本。云端回收站、历史版本和备份可能保留先前内容；移入回收站不等于立即永久删除。永久删除和存储清理按服务的实际流程进行，备份中的残留随正常备份轮换处理。

## 5. 更新、下载与其他第三方

配置了更新源的发行版可能检查更新并在后台下载；没有更新源的构建不会通过该更新功能自动检查。示例、素材、工具安装和外部资源访问也可能连接 GitHub、资源站或你指定的地址。这些接收方通常可获得网络地址、请求路径及客户端发送的必要设备或版本信息。

相关第三方政策包括 [GitHub 隐私声明](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)，以及在实际使用对应服务时适用的 [Anthropic 隐私政策](https://www.anthropic.com/legal/privacy)和 [OpenAI 隐私政策](https://openai.com/policies/privacy-policy/)。后两者仅用于相应服务，不表示所有请求都直接发送给这些公司。其他模型、生成平台、外部代理、自定义网关及云基础设施以实际接入方的说明为准。

玩剧不会出售个人信息或将其用于广告画像。当前审阅的核心代码未集成广告画像分析 SDK；第三方网页、远程资源和你选用的代理仍可能按各自政策处理信息。网页账号入口会使用必要的浏览器会话存储；不同网站的 Cookie 由各自管理。

## 6. 保存、安全与披露

本地文件由你管理，卸载应用不一定删除个人项目。服务端信息按账号服务、项目保存、计费核对、安全及适用保留要求所需期限保存；当前没有适用于所有记录的统一自动删除期限。停止自动同步不会自动删除已保存的云端版本。

我们使用访问控制、HTTPS、密码哈希及适用的凭据保护措施，限制接触私密内容的范围。维护者可能为账号支持、运维或安全调查访问必要记录；依法必须披露时按适用要求处理。任何系统都无法保证绝对安全，云数据也不因本地凭据受到保护而成为端到端加密数据。

## 7. 你的选择与请求

你可以选择本地工作、退出账号、停止云同步、删除可删除的云项目，或停止使用外部供应商。已经发送的数据不会因退出客户端自动从第三方系统删除。

如需查询、更正、导出或删除账号及相关数据，或对可选处理提出撤回请求，请发送邮件至 **max198733@qq.com**。目前账号注销通过维护者人工处理，不应假定客户端已有自助注销入口。我们会核验账号归属，并说明可处理的范围和必要保留情况；依法或为必要的交易、安全核查保留的记录可能不能立即删除。

邮件中只提供定位账号和问题所需的信息，不要发送密码、完整会话令牌或供应商密钥。邮件内容也由你与我们使用的邮件服务商处理。涉及未成年人信息时，请监护人协助选择服务和提出请求；不要在提示词、公开项目或支持邮件中提供不必要的儿童敏感资料。

## 8. 政策更新

当数据流、服务或联系方式发生实质变化时，我们会更新本文件及日期。涉及需要另行告知或取得同意的变化，应通过相应服务流程处理，不能仅以修改本文件代替。

## English Version

**Effective and last updated: November 6, 2026.** The maintainer is **Ma Xin**, GitHub account `max198733`; privacy contact: **max198733@qq.com**. This policy covers Wanju Studio and the maintainer-operated optional account and cloud services at `wanju.kukukaka.cn`. Independent deployments need their own operator disclosures. Publishing this document does not itself add privacy controls or installation notices to existing binaries.

**Local work.** Import, timeline editing, preview and local export primarily run on your device. Project and application directories can contain media, prompts, conversations, tool history, caches and logs. Remote resources embedded in projects can still cause network requests. External creative agents can read authorized project context, use tools and make requests under their own settings and policies; their telemetry is not necessarily disabled by Wanju.

**Accounts.** The service processes usernames, credentials, account identifiers, sessions, status and service records. Normal registration does not require email or phone details; manual or legacy activation may receive contact details, notes or activation codes you provide. Passwords are stored as salted hashes and server-side sessions as token hashes. Desktop account-session storage requires operating-system credential protection; the web account interface uses browser session storage. Some other local provider-key settings can fall back to local file storage when OS encryption is unavailable. Do not assume that every local setting is encrypted.

**Network operations and AI.** Authentication, status, balance and provider-configuration requests can occur on startup or refresh. Servers process necessary network addresses, request timing and diagnostic/security information. AI requests can include prompts, messages, selected project context, tool definitions/results and requested media or links. Account-based AI requests pass through the Wanju gateway to configured providers. At the time of this review the official account service uses the XEM relay at <https://ai.xem8k5.top/>, which may use additional upstream services. A verifiable independent XEM privacy-policy URL has not been established; contact the maintainer before submitting sensitive information. A model vendor's policy does not automatically describe a relay's practices.

With a custom provider, requests and required authentication data go to your configured endpoint. Provider retention, training use, deletion practices and processing locations depend on the particular service and agreement. Wanju cannot promise universal non-retention or exclusion from training. Billing records include balance changes, request IDs, status, timestamps, usage, fees and model/configuration versions. They are not intended as a full prompt archive, but local histories, diagnostics or providers may retain content.

**Optional cloud projects.** Manual upload or enabled automatic saving sends project files, titles, relative paths, sizes, content hashes, revisions and timestamps. Automatic saving can continue until paused, disabled or signed out. The upload inventory includes various project-directory files, with limited exclusions for common hidden, credential, log and cache paths; symlinks are rejected. Exclusions do not detect every secret. Review files before uploading.

Cloud access is scoped to the account and transfers use HTTPS. Storage is not end-to-end encrypted: the operator and necessary infrastructure providers can access data for service delivery, backups, support and security. Hosting and providers can process data in different jurisdictions; this policy does not promise China-only processing. Local deletion does not delete cloud copies. Trash, historical revisions and backups can retain earlier files. Permanent deletion, object cleanup and normal backup rotation determine removal.

**Other services.** Builds with an update feed may check for and download updates; builds without a feed do not check through that updater. Examples, assets, tool installation and external resources can contact GitHub or other selected hosts, which receive ordinary network and request metadata. The linked GitHub, Anthropic and OpenAI policies above apply only when their services are actually involved; other agents, relays and providers have their own practices. Wanju does not sell personal information or use it for advertising profiles. The reviewed core has no advertising-profile analytics SDK; third-party resources and agents can still collect information independently.

**Retention, security and choices.** Local data remains under your control and uninstalling may leave projects behind. Service records are retained as needed for account/project operation, billing, security and applicable requirements, without a single automatic deletion deadline for all records. Disabling sync does not delete existing cloud versions. Access controls, HTTPS, password hashes and applicable credential protection reduce risk but do not guarantee absolute security. Necessary operator access and legally required disclosures may occur.

You can work locally, sign out, disable sync, delete cloud projects where supported and stop using external providers. This does not automatically erase data already sent elsewhere. Email **max198733@qq.com** for access, correction, export, account deletion or withdrawal requests for optional processing. Account deletion currently requires manual handling and ownership verification; necessary retained records may not be immediately erased. Do not send passwords, complete session tokens or API keys. Support email is also processed by the email providers involved. Guardians should assist minors and avoid unnecessary sensitive child information. Material policy changes will update this document; changes requiring notice or consent must also be handled in the relevant service flow.
