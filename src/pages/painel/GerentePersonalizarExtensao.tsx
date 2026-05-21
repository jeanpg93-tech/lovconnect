import { PageHeader, PageContainer } from "@/components/painel/PageHeader";
import { ExtensionCustomizer } from "@/components/extension-customizer/ExtensionCustomizer";
import { BaseExtensionUploader } from "@/components/extension-customizer/BaseExtensionUploader";

export default function GerentePersonalizarExtensao() {
  return (
    <PageContainer>
      <PageHeader
        title="Personalizar Extensão (Padrão)"
        description="Edite o template global da extensão. Revendedores que não personalizarem usam este padrão."
      />
      <BaseExtensionUploader />
      <ExtensionCustomizer scope="template" />
    </PageContainer>
  );
}
