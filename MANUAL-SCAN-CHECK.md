# Teste manual com scans reais — prévia local

Usar a mesma aba/perfil e http://localhost:8087. Não trocar para 127.0.0.1, outra porta ou navegação anônima: a origem/perfil define onde fica a sessão. Não limpar dados do navegador, não resetar stamps. Internet necessária para Supabase e CDNs. Esta prévia usa o Worker com autorização real.

1. Abra http://localhost:8087/stamp-rally.html e confira o progresso atual.
2. Clique パネルSCAN e depois SCAN開始. Permita a câmera quando o navegador solicitar. Apresente um painel/marker real correspondente aos targets atuais. Não usar ferramentas de simulação.
3. Após reconhecimento, aguarde a confirmação normal e abra cartão/voz. Feche e confira o progresso no Rally; um stamp já coletado não deve duplicar a contagem.
4. Em http://localhost:8087/character-list.html, confirme que só os personagens obtidos mostram as ações. Abra cartão, áudio e AR do personagem obtido. No AR, aguarde o modelo, posicione-o e teste os gestos normais.
5. Faça o scan dos condutores conforme o fluxo normal: cada um exige seu scan e aparece na lista; a contagem do Rally continua limitada às oito estampas de IDs 4–11.
6. Com as oito estampas na sessão, a recompensa aparece. Clique somente 特典を見る para abrir Complete com imagem/voz. Com sete stamps mais os três condutores, o prêmio deve continuar bloqueado.
7. Recarregue a página: progresso e acesso devem continuar presentes. Uma URL de arquivo colada diretamente sem o cabeçalho de autorização deve retornar 403, mesmo para usuário coletado; as páginas carregam a mídia com token automaticamente.

Não foi feita nenhuma coleta, alteração de Supabase/RLS ou desbloqueio artificial nesta preparação. Não houve publicação. Para testar em outro dispositivo será necessário acesso HTTPS e considerar que o login anônimo pode ser outro usuário. O teste aqui é no PC com webcam e localhost.

Se houver falha, anotar página, personagem, etapa, mensagem e horário. Não divulgar tokens de sessão. A conta com oito stamps será usada nos testes finais de integração.

## Inicialização local com certificados do Windows
Usar Node com `--use-system-ca`: `node --use-system-ca checks/preview-server.cjs`. Diagnóstico em 30/10: sem essa opção, o Node deste PC apresentou UNABLE_TO_VERIFY_LEAF_SIGNATURE ao consultar Supabase; com ela, Auth settings e consulta REST de leitura responderam 200. A validação TLS permanece ativa. Não usar NODE_TLS_REJECT_UNAUTHORIZED=0. Nenhum registro foi modificado.
