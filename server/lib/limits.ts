import { rateLimit } from "express-rate-limit";
import { config } from "../config.ts";

function limiter(windowMinutes: number, limit: number, message: string) {
  return rateLimit({
    windowMs: windowMinutes * 60_000,
    limit,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    skip: () => config.env === "test",
    handler: (_req, res) => {
      res.status(429).json({ error: { code: "rate_limited", message } });
    },
  });
}

export const authLimiter = limiter(15, 40, "Muitas tentativas. Espere alguns minutos e tente de novo.");
export const smsLimiter = limiter(60, 15, "Muitos códigos pedidos. Tente de novo mais tarde.");
export const mailLimiter = limiter(60, 10, "Muitos pedidos de troca de senha. Tente de novo mais tarde.");
export const uploadLimiter = limiter(60, 150, "Muitas fotos enviadas. Espere um pouco.");
export const apiLimiter = limiter(1, 600, "Muitas requisições. Espere um pouco.");
