# Wanju Studio

This is a locally adapted OpenFilm source tree for conversation-driven short drama and video creation.

For production requests, first read `.agents/skills/wanju-creator/SKILL.md` and use its existing tools. The host AGI does the writing and planning; keep the workbench as the review/edit surface. Do not rebuild another chat model or replace the original film engine.

Engineering changes should preserve the upstream structure and original MIT/trademark notices. The user's third-party credentials are private in `.local/config`; never print or copy them into code, prompts, frontend assets or documentation. Generated projects, exports and intermediate tests are not source.

The local bridge is `scripts/wanju-agent.mjs`; the standard stdio MCP server is `integrations/agent/server.mjs`. Both execute the same project operations. Read the current revision before saving a board. Paid generation requires prior user authorization for its scope.
