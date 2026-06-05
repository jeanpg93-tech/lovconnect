import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { MessageCircle, Bell, Send, History } from "lucide-react";
import TabConexao from "@/components/whatsapp-sistema/TabConexao";
import TabEventos from "@/components/whatsapp-sistema/TabEventos";
import TabManual from "@/components/whatsapp-sistema/TabManual";
import TabHistorico from "@/components/whatsapp-sistema/TabHistorico";

export default function GerenteWhatsAppSistema() {
  const [tab, setTab] = useState("conexao");

  return (
    <div className="space-y-6 p-4 md:p-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">WhatsApp do Sistema</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Notificações automáticas e envios manuais aos revendedores via WhatsApp.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 w-full h-auto">
          <TabsTrigger value="conexao" className="flex items-center gap-2 py-2.5">
            <MessageCircle className="h-4 w-4" /> <span className="hidden sm:inline">Conexão</span><span className="sm:hidden">Conex.</span>
          </TabsTrigger>
          <TabsTrigger value="eventos" className="flex items-center gap-2 py-2.5">
            <Bell className="h-4 w-4" /> <span className="hidden sm:inline">Eventos</span><span className="sm:hidden">Event.</span>
          </TabsTrigger>
          <TabsTrigger value="manual" className="flex items-center gap-2 py-2.5">
            <Send className="h-4 w-4" /> <span className="hidden sm:inline">Envio manual</span><span className="sm:hidden">Manual</span>
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex items-center gap-2 py-2.5">
            <History className="h-4 w-4" /> <span className="hidden sm:inline">Histórico</span><span className="sm:hidden">Histór.</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="conexao" className="mt-4">
          <TabConexao />
        </TabsContent>
        <TabsContent value="eventos" className="mt-4">
          <TabEventos />
        </TabsContent>
        <TabsContent value="manual" className="mt-4">
          <TabManual />
        </TabsContent>
        <TabsContent value="historico" className="mt-4">
          <TabHistorico />
        </TabsContent>
      </Tabs>
    </div>
  );
}