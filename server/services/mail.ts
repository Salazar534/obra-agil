import nodemailer from "nodemailer";
import { config } from "../config.ts";
import { unavailable } from "../lib/errors.ts";

const transport = config.smtpUrl ? nodemailer.createTransport(config.smtpUrl) : null;

/** smtp: real email. console: development only, the message is printed in the API terminal. */
export const mailMode: "smtp" | "console" | "disabled" = transport ? "smtp" : config.isProduction ? "disabled" : "console";

export async function sendMail(message: { to: string; subject: string; text: string; html: string }) {
  if (transport) {
    await transport.sendMail({ from: config.mailFrom, ...message });
    return;
  }
  if (mailMode === "console") {
    console.log(`\n[mail] Para: ${message.to}\n[mail] Assunto: ${message.subject}\n${message.text}\n(modo desenvolvimento, nenhum e-mail foi enviado)\n`);
    return;
  }
  throw unavailable("mail_unavailable", "Não conseguimos enviar e-mails agora. Tente mais tarde.");
}

export function resetPasswordEmail(name: string, link: string) {
  const first = name.split(/\s+/)[0];
  return {
    subject: "Crie uma nova senha no Obra Ágil",
    text: `Oi, ${first}!\n\nRecebemos um pedido para trocar a senha da sua conta. Abra o link abaixo para criar uma nova (vale por 30 minutos):\n\n${link}\n\nSe não foi você, ignore este e-mail. Sua senha continua a mesma.`,
    html: `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:auto;padding:24px;color:#0b1b33">
  <h1 style="font-size:22px;margin:0 0 12px">Oi, ${first}!</h1>
  <p style="font-size:16px;line-height:1.5">Recebemos um pedido para trocar a senha da sua conta no Obra Ágil.</p>
  <p style="margin:24px 0"><a href="${link}" style="background:#0a66e0;color:#fff;text-decoration:none;padding:14px 22px;border-radius:999px;font-weight:600;display:inline-block">Criar nova senha</a></p>
  <p style="font-size:14px;color:#6c6c70">O link vale por 30 minutos. Se não foi você, ignore este e-mail.</p>
</div>`,
  };
}
