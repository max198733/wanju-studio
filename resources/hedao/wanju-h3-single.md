# 单图首帧视频线路

这是玩剧对 `minimax_h3_zm_nono` 的单镜快速线路适配。它只发送当前镜头的一张首帧图片和文字提示词，不发送额外参考图、参考视频或参考音频。成功下载后复用 OpenFilm 原生镜头与时间轴，不另造一套剪辑数据。

## 请求约束

- 创建地址：`POST https://autodl.art/api/v1/comfyui/comfyui_workflow/minimax_h3_zm_nono`
- 认证：`Authorization: <AutoDL API Key>`，请求体为 JSON。
- `prompt` 必填，最多 20000 个字符。
- `duration` 为 1–15 秒整数；玩剧默认使用当前镜头时长。
- `resolution` 默认按项目画幅选择 `768p竖` 或 `768p横`。当前确认的选项为 `480p竖`、`768p竖`、`960p竖`、`480p横`、`768p横`；未确认的横屏 960p 不自动发送。
- `ref_image_0` 必须是当前镜头首帧图片的公网 HTTPS 地址。
- `ref_audio_*`、`ref_image_1` 到 `ref_image_8` 不发送。

## 返回与落盘

创建和查询均使用响应中的 `data.task_id`。任务终态同时识别 `SUCCESS`、`SUCCEEDED` 和 `COMPLETED`。完成后从 `data.results[]` 中取 `type=video` 且 `output_type=output` 的 MP4 地址，下载到本地，检查视频可读后才绑定到 OpenFilm 原生时间轴。签名下载地址仅在内存中短暂使用，不写入项目任务记录。

已提交但结果未知的任务只能查询原任务，不能重复创建。单图线路适合快速验证动作和效率，不等于人物一致性方案；需要稳定人物、场景和道具时仍使用何导资产闭环与 Seedance 多参考线路。
