import { Wallet, ArrowRight, Info } from "lucide-react";
import { Link } from "react-router-dom";

type Props = {
  /** Rótulo do produto usado no texto (ex.: "chaves Claude", "licenças de extensão"). */
  product?: string;
  /** Se true, esconde o botão de adicionar saldo. */
  hideCta?: boolean;
  className?: string;
};

/**
 * Aviso padrão: toda venda desconta do saldo da carteira do revendedor.
 * Se não houver saldo suficiente no momento da venda, o pedido fica
 * `aguardando saldo` e é liberado automaticamente assim que a próxima
 * recarga cobrir o valor da venda.
 */
export function WalletBalanceRuleNotice({
  product = "chaves",
  hideCta = false,
  className = "",
}: Props) {
  return (
    <div
      className={`rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/10 via-amber-500/5 to-transparent p-4 sm:p-5 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-500">
          <Wallet className="h-4.5 w-4.5" />
        </div>
        <div className="flex-1 space-y-1.5">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              Como funciona o pagamento das vendas
            </h4>
          </div>
          <p className="text-xs sm:text-[13px] leading-relaxed text-muted-foreground">
            Cada venda de <span className="font-medium text-foreground">{product}</span> é
            debitada <span className="font-medium text-foreground">automaticamente do saldo do seu painel</span>.
            É necessário ter saldo igual ou maior que o custo da venda no momento da emissão.
          </p>
          <p className="text-xs sm:text-[13px] leading-relaxed text-muted-foreground">
            <Info className="mr-1 inline h-3.5 w-3.5 text-amber-500" />
            Se o saldo for insuficiente, o pedido fica{" "}
            <span className="font-semibold text-amber-600 dark:text-amber-400">aguardando saldo</span>{" "}
            e a chave <span className="font-medium text-foreground">não é entregue ao cliente</span>.
            Assim que você recarregar o painel com valor suficiente, a venda é{" "}
            <span className="font-medium text-foreground">liberada automaticamente</span> e a chave é gerada e enviada.
          </p>
        </div>
        {!hideCta && (
          <Link
            to="/painel/revendedor/adicionar-saldo"
            className="hidden sm:inline-flex items-center gap-1.5 self-center rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-semibold text-amber-600 hover:bg-amber-500/20 transition-colors"
          >
            Adicionar saldo <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        )}
      </div>
    </div>
  );
}

export default WalletBalanceRuleNotice;