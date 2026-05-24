import { MessageCircle, Users } from "lucide-react";

const SUPPORT_URL = "https://wa.me/5511936183472";
const GROUP_URL = "https://chat.whatsapp.com/HMaprTx4J4FAOWku1QxsNE";

type Props = {
  /** Distância extra do rodapé (px). Útil pra fugir da MobileNav no painel. */
  bottomOffset?: number;
  /** Mostrar botão do grupo (apenas revendedores pagantes). */
  showGroup?: boolean;
};

export const WhatsAppFloatingButtons = ({ bottomOffset = 16, showGroup = false }: Props) => {
  return (
    <div
      className="fixed right-4 z-40 flex flex-col gap-2"
      style={{ bottom: `calc(${bottomOffset}px + env(safe-area-inset-bottom))` }}
    >
      <a
        href={SUPPORT_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="WhatsApp do suporte"
        title="Suporte no WhatsApp"
        className="group flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-lg backdrop-blur-sm transition hover:scale-105 hover:bg-emerald-500/20 hover:text-emerald-300"
      >
        <MessageCircle className="h-5 w-5" />
      </a>
      {showGroup && (
      <a
        href={GROUP_URL}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Grupo de revendedores no WhatsApp"
        title="Grupo no WhatsApp"
        className="group flex h-11 w-11 items-center justify-center rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 shadow-lg backdrop-blur-sm transition hover:scale-105 hover:bg-emerald-500/20 hover:text-emerald-300"
      >
        <Users className="h-5 w-5" />
      </a>
      )}
    </div>
  );
};

export default WhatsAppFloatingButtons;