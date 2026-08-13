import { getAppUrl, getPlatformName } from "@/lib/env";

function appBase(): string {
  return getAppUrl().replace(/\/$/, "");
}

export function inviteEmail(opts: {
  name: string | null;
  token: string;
}): { subject: string; html: string; text: string } {
  const platform = getPlatformName();
  const link = `${appBase()}/definir-senha?token=${encodeURIComponent(opts.token)}`;
  const greet = opts.name?.trim() ? opts.name.trim() : "olá";
  const subject = `Convite — ${platform}`;
  const text = `${greet},\n\nVocê foi convidado(a) para o ${platform}.\nDefina sua senha neste link (válido por 7 dias):\n${link}\n`;
  const html = `<p>${greet},</p><p>Você foi convidado(a) para o <strong>${platform}</strong>.</p><p><a href="${link}">Definir senha</a> (válido por 7 dias)</p><p style="color:#666;font-size:12px">${link}</p>`;
  return { subject, html, text };
}

export function resetEmail(opts: {
  name: string | null;
  token: string;
}): { subject: string; html: string; text: string } {
  const platform = getPlatformName();
  const link = `${appBase()}/definir-senha?token=${encodeURIComponent(opts.token)}`;
  const greet = opts.name?.trim() ? opts.name.trim() : "olá";
  const subject = `Redefinir senha — ${platform}`;
  const text = `${greet},\n\nRecebemos um pedido para redefinir sua senha.\nUse este link (válido por 1 hora):\n${link}\n\nSe não foi você, ignore este e-mail.\n`;
  const html = `<p>${greet},</p><p>Recebemos um pedido para redefinir sua senha no <strong>${platform}</strong>.</p><p><a href="${link}">Redefinir senha</a> (válido por 1 hora)</p><p style="color:#666;font-size:12px">${link}</p><p>Se não foi você, ignore este e-mail.</p>`;
  return { subject, html, text };
}
