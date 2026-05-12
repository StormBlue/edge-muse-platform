# Review Round 4 - 安全

## 结论

通过。ALTCHA 校验 fail closed，关键失败路径不会泄露 secret 或 payload。

## 检查点

- `ALTCHA_HMAC_KEY` 缺失时 challenge 签发抛错，proof 校验返回 false。
- payload 校验包含 Widget v3 parameters、counter 安全整数范围、过期时间、HMAC signature、solution 和难度上限。
- replay key 生产写入 Durable Object，重复 payload 第二次失败；KV 仅作为 fallback。
- replay key 使用 digest 派生，不存 payload 明文。
- 日志只记录事件名，不记录 HMAC key、payload 或用户密码。
- captcha 失败仍走现有登录限流。

## 剩余风险

如果生产环境 Durable Object binding 缺失，会回退 KV replay；如果 replay 存储不可用，ALTCHA proof 校验会 fail closed。
