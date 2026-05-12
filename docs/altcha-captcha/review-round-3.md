# Review Round 3 - 性能与 Cloudflare CPU

## 结论

通过。当前实现避免在 Worker 上执行 PoW 循环，适合 Cloudflare CPU 预算有限的约束。

## 检查点

- Worker challenge 生成只随机选一个 number 并计算一次 SHA-256 + HMAC。
- Worker proof 校验只做 HMAC、常数次 SHA-256 和一次 replay 消费；生产 replay 走 Durable Object 原子写入。
- `altchaDifficulty` 上限固定为 `200000`，默认 `50000`。
- 前端 widget 配置 `workers: 1`，避免客户端并发 worker 过高。
- ALTCHA 前端包通过动态 import 单独分块，非 ALTCHA 登录路径不主动加载。

## 剩余风险

PoW 本质上弱于 Turnstile/Tencent 这类托管风控；因此默认仍保持国内 Tencent、国外 Turnstile，ALTCHA 作为 sysadmin 可配置选项。
