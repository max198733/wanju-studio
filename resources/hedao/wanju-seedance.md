# 玩剧默认视频线路：Seedance 2.0

本说明是当前桌面工具的实际接入合同，补充何导工作流的创作、连续性与审核规则。只接入 Seedance 2.0，不自动启用 2.5。未执行真实付费生成验证。

## 配置

老师在「设置 → 服务商 → 玩剧 · AI 制作 → 视频生成 · 多模态线路」填写火山方舟 API Key。沿用 `seedance_video_config.json` 的 `api_key` 字段，模型固定为 `doubao-seedance-2-0-260128`。不能复用 RunningHub 或其他中转站的密钥。保存只写本机配置，不发送生成请求。

`wanju generate_video` / `wanju_generate_video` 默认使用 `provider: "seedance"`。明确填写 `provider: "h3"` 才使用原有标准线路。`sparkvideo` 已停用新提交；旧任务仍保留原服务与原任务号，不转发、不自动重做。

## 工具参数与参考素材

`video_options` 支持：

- `prompt`：完整的视频提示词，保留分镜动作、镜头、人物、场景和声音要求。
- `resolution`：`480p` / `720p` / `1080p`，默认 `720p`。
- `duration`：如提供，必须与镜头计划时长一致；当前单镜为 4–15 秒整数，禁止悄悄截断。
- `ratio`：默认使用项目画幅，支持 `9:16` / `16:9` / `1:1` / `adaptive`。
- `imageUrls`、`videoUrls`、`audioUrls`：按引用顺序传入项目 `assets/...` 路径或公网 HTTPS 链接。最多 9 张图片、3 段视频、3 段音频；本地图片为 PNG/JPG/WebP、视频为 MP4/MOV、音频为 MP3/WAV。参考音频必须与参考图片或视频同时提供。
- `generateAudio`：默认 `true`，映射为 `generate_audio`。不承诺每镜生成的声线一致；声线锁定项目应关闭并在后期统一配音。
- `watermark`：默认 `false`。
- 可选 `seed`、`returnLastFrame`，分别映射为 `seed`、`return_last_frame`。

未提供参考素材时是纯文本生成，不会自动复用当前分镜图。何导工作流先审核角色、场景和道具资产，按实际需要显式传入引用。保持数组与提示词编号一致；默认提示词可用 `@Image 1`、`@Video 1`、`@Audio 1`。也可以显式传入采用中文「图片1」「视频1」「音频1」引用的原始提示词。

本地素材通过已配置的 COS 上传；公网 HTTPS 素材直接引用。密钥、签名链接及原始服务响应不得写入剧本、对话和生成台账。

## 原生异步任务与时间轴

1. 使用最新 revision 保存分镜并完成审核。用户明确授权本次线路与数量后才能设置 `confirm_spend:true`。
2. 提交 `POST https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks`，请求正文为 `model`、`content`、`generate_audio`、`ratio`、`duration`、`watermark` 等字段。`content` 按文本、图片、视频、音频顺序构造，引用分别标明 `reference_image`、`reference_video`、`reference_audio`。
3. 保存创建响应顶层 `id`；查询 `GET /api/v3/contents/generations/tasks/{id}`，只查原任务，不重复创建。旧工作流所写的 `task.id` 在本工具中以官方响应顶层 `id` 为准。
4. `queued/running` 等待；`failed/expired/cancelled` 保存安全的失败原因；只有 `succeeded` 读取 `content.video_url`。
5. 成功后下载本地并探测真实视频，绑定原镜头，使用原生 OpenFilm 同步逻辑在时间轴插入一次。待生成镜头、图片参考和尾帧都不进入时间轴。不再次手工插入副本。
6. 提交超时、网关错误、缺失任务号等保存为结果未知，不自动补发；下载失败只重试原任务下载。
7. 把每次授权、任务号、镜头和实际状态记入生成台账。模型更换不会自动补齐角色定妆、场景参考或通过未完成的审核。

## 首次验证

先用一个已审核镜头完成「提交 → 查询 → 下载 → 时间轴」测试，再考虑批量。开发测试使用模拟响应，不代表真实出片质量、计费或账号模型权限已验证。

协议依据：用户提供的方舟 Seedance 2.0 cURL；火山方舟官方创建与查询文档：

- https://www.volcengine.com/docs/82379/1520757
- https://www.volcengine.com/docs/82379/1521309
