-- Criar tabela de premiações do ranking
CREATE TABLE public.ranking_prizes (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    position INTEGER NOT NULL, -- 1 para 1º lugar, 2 para 2º, etc.
    title TEXT NOT NULL,
    description TEXT,
    prize_value TEXT, -- Ex: "R$ 500,00", "iPhone 15", etc.
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    UNIQUE(position)
);

-- Ativar RLS
ALTER TABLE public.ranking_prizes ENABLE ROW LEVEL SECURITY;

-- Políticas
CREATE POLICY "Prêmios visíveis por todos autenticados" 
ON public.ranking_prizes FOR SELECT 
USING (auth.role() = 'authenticated');

CREATE POLICY "Gerentes gerenciam prêmios" 
ON public.ranking_prizes FOR ALL 
USING (public.has_role(auth.uid(), 'gerente'));

-- Trigger para updated_at
CREATE TRIGGER set_ranking_prizes_updated_at
BEFORE UPDATE ON public.ranking_prizes
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- Inserir alguns prêmios padrão iniciais
INSERT INTO public.ranking_prizes (position, title, description, prize_value) VALUES
(1, 'Campeão de Vendas', 'Prêmio para o maior vendedor do mês corrente.', 'R$ 1.000,00 em Saldo'),
(2, 'Vice-Campeão', 'Recompensa pelo excelente desempenho mensal.', 'R$ 500,00 em Saldo'),
(3, 'Top 3 Bronze', 'Recompensa por figurar entre os melhores.', 'R$ 200,00 em Saldo');