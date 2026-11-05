# Proteção de conteúdo — implementação local 30/10/2026

Não publicado. Não houve alteração de Supabase, RLS, coleta ou MindAR.

Worker: server/worker.mjs. Usa token Supabase validado no servidor e registros existentes em user_stamps. IDs 4–11 contam para o prêmio; 12–14 exigem scan individual e não contam. Sem autorização: 403. Backend indisponível: 503. Mídias protegidas: stamps, cartões, vozes, modelos, prêmio e cópias dos três cartões na pasta de retratos. Retratos de prévia dos oito personagens, markers, molduras e efeito stamp.mp3 continuam públicos por sua função no layout/coleta.

Cache: respostas protegidas e negações usam private/no-store e instruções no-store para CDN; não configurar regras de cache que sobreponham estas instruções. HTML/JS retornam no-store para receber o carregamento atualizado. O cache privado de blobs só reutiliza mídia já entregue a uma sessão autorizada.

Prévia normal 8087 agora usa o Worker, preservando a mesma origem e sessão. 8088 também pode ser iniciada com checks/secure-preview.mjs. Não usar o antigo servidor estático para avaliar proteção.

Páginas mantêm elementos/classes/navegação. Conteúdo bloqueado usa placeholder público genérico, pois a arte original não pode ser enviada antes da autorização. Os três retratos de condutores são idênticos aos cartões; por isso também exigem desbloqueio.

Publicação Pages: executar checks/build-pages.mjs em uma saída vazia; saída _pages-build/release. O script não publica e falha se a saída já existir com conteúdo. O build verifica duplicatas idênticas em rotas públicas. Para novo build, escolher/recriar a saída de forma controlada. _worker.js é cópia de server/worker.mjs, _routes.json inclui /* e não exclui rotas. Configurar SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY no ambiente Pages. Build de produção e preview precisam das mesmas regras. Diretório de publicação deve ser _pages-build/release, nunca a raiz original estática. Wranger atual é de Workers Static Assets; não garante por si só execução no Pages.

Antes de publicar: confirmar build real no painel, domínio estável para preservar sessão, ausência de overrides de cache e falha fechada se Functions atingir limites. Após autorização separada: substituir publicação antiga, invalidar cache e retirar/restringir deployments antigos e aliases que ainda sirvam mídias públicas. Nesta implementação nenhuma remoção ocorreu.

Testes: node --experimental-vm-modules checks/security-test.mjs; node --experimental-vm-modules checks/verify.cjs; node checks/content-access-integration.mjs. Integração usa Worker real via HTTP e navegador, com Supabase simulado; não certifica RLS real nem presença física no scan. Preserva registros existentes. Quem recebeu conteúdo autorizado pode salvá-lo; não há DRM. Gravação de coleta continua no cliente conforme escopo aprovado.

## Prévias públicas autorizadas
A pedido do usuário, assets/previews contém oito stamps de 96 px e prêmio de 240 px. São arquivos públicos reduzidos exibidos com opacidade; originais, áudio e modelos continuam protegidos. Nenhum registro de coleta foi modificado. Recriar o pacote Pages antes de publicar; o pacote anterior não contém esta atualização.
