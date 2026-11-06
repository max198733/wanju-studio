# 玩剧多模态视频线路

> 当前新提交已停用此线路。请先读 `wanju guide video_seedance` 并使用 `provider: "seedance"`。下文只保留历史协议说明，不能作为继续提交 RunningHub 任务的指引。历史任务仍查询原平台，不会迁移或重新计费。

本适配说明补充何导工作流，不替换原有阶段及审核规则。官方协议核对日期：2026-10-28。未完成真实付费生成验证。

## 配置与选择

老师在「设置 → 服务商 → 玩剧 · AI 制作 → 视频生成 · 多模态线路」填写 RunningHub API 密钥。底层固定连接 https://www.runninghub.cn，配置文件为 runninghub_sparkvideo_config.json。密钥由程序读取，不要将密钥读入对话、项目文档或请求参数。不能复用其他中转站的密钥。

`wanju generate_video` / `wanju_generate_video` 使用 `provider: "sparkvideo"`。未指定 provider 时保留原 H3 线路，不会自动切换或补发。

## 参数

`video_options` 支持 prompt、resolution、duration、imageUrls、videoUrls、audioUrls、generateAudio、ratio、realPersonMode、conversionSlots、returnLastFrame、seed。

- 时长取镜头计划时长，须为 4–15 秒整数；duration 如提供必须一致。
- 当前开放已核对的 720p；默认 ratio=adaptive，可显式设置为项目的 9:16 / 16:9 / 1:1。
- 图片最多 9 个，视频最多 3 个，音频最多 3 个。数组元素为项目内 assets/... 路径或可供服务商读取的公网 HTTPS 链接。本地素材使用已配置的 COS 上传，公网链接不重复上传。不要使用文档示例的临时签名链接。
- imageUrls 省略时使用当前镜头分镜图；显式 [] 表示不使用图片。videoUrls/audioUrls 默认 []，不自动把上一版视频作为参考。
- 保留数组顺序。prompt 可用 @Image 1、@Video 1、@Audio 1 引用对应素材；不要写不存在的编号。prompt 省略则从画面描述和台词构造。
- 默认 generateAudio=true、realPersonMode=true、conversionSlots=["all"]、returnLastFrame=false、seed=-1。不承诺生成台词、音色或人物身份必然一致。

## 创作与执行

1. 先完成分镜审核、角色定妆、场景及必要参考素材。审核不通过不能把结论改成通过来跳过；需要用户批准偏离流程时明确记录实际缺项。
2. 选择本镜头真实人物及场景参考，写明人物、动作、运镜、连续性和声音要求。不能仅因换视频模型便承诺质量改善。
3. `get/current` 读取最新 revision；只有用户授权相应线路和提交数量后，才设置 confirm_spend=true。首次先做一个镜头，不自动批量重做。
4. 工具 POST /openapi/v2/rhart-video/sparkvideo-2.0/multimodal-video，保存 taskId。状态查询 POST /openapi/v2/query，正文 {"taskId":"原任务ID"}。后台自动查询原任务，暂时失败不会补发生成。
5. SUCCESS 时仅接受视频输出，下载本地、探测成功后绑定镜头并同步原生 OpenFilm 时间轴。图片与待生成镜头不上时间轴。不要再次手工插入相同视频，避免重复声音。
6. 逐次记录任务 ID、镜头、线路和实际状态，更新项目生成台账及阶段状态。额度扣费以服务商记录为准，不把 unknown 当作免费失败。
7. 网络或下载失败时查询原任务。禁止自动更换线路、补发或重复计费。返回的最后一帧不会作为视频加入时间轴。

官方说明：
- https://www.runninghub.cn/runninghub-api-doc-cn/api-448183127
- https://www.runninghub.cn/runninghub-api-doc-cn/api-425767306
