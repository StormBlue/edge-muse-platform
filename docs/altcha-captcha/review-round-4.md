# Review Round 4 - 安全

## 结论

通过。ALTCHA 校验 fail closed，关键失败路径不会泄露 secret 或 payload。

## 检查点

- `ALTCHA_HMAC_KEY` 缺失时 challenge 签发抛错，proof 校验返回 false。
- payload 校验包含 algorithm、number 安全整数范围、过期时间、HMAC signature、challenge hash。
- replay key 写入 KV，重复 payload 第二次失败。
- replay key 使用 digest 派生，不存 payload 明文。
- 日志只记录事件名，不记录 HMAC key、payload 或用户密码。
- captcha 失败仍走现有登录限流。

## 剩余风险

如果 KV binding 在生产缺失，ALTCHA proof 校验会 fail closed；部署文档已要求保留 KV binding。
