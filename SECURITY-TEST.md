# Versão de teste com bloqueio no servidor

Projeto original preservado em ../characterAR_development.
Cópia de teste: characterAR_secure. Preview local: http://localhost:8088.

## O que mudou
- Cloudflare Worker executa antes dos arquivos estáticos (run_worker_first=true).
- Modelos, cartões e vozes dos personagens IDs 4 a 11 exigem token válido e uma estampa do próprio usuário.
- O servidor verifica a sessão no Supabase Auth e consulta user_stamps com o token do usuário.
- Arquivos negados não chegam ao serviço de assets.
- Respostas protegidas usam private, no-store.
- O navegador carrega mídia autorizada como blobs; links diretos sem token retornam 401.
- Personagens grátis (IDs 12 a 14) e os 52 fotoframes continuam públicos.
- Na lista, os retratos são prévias públicas, com a silhueta aplicada pelo CSS aos personagens bloqueados. Os modelos, cartões e vozes continuam protegidos.

## Limites e pendências
- Esta cópia NÃO está publicada e não substituiu a versão original.
- Nenhuma política RLS ou registro do Supabase foi alterado.
- As regras RLS e gravações reais ainda devem ser verificadas antes da publicação.
- O cliente ainda grava as estampas após reconhecer o marcador. Um usuário técnico pode tentar forjar essa gravação. É necessário definir uma prova confiável de coleta para bloquear esse ataque (por exemplo, códigos individuais verificados no servidor). O reconhecimento visual no navegador sozinho não comprova a presença do marcador.
- Quem já recebeu um arquivo pode salvá-lo; este controle de acesso não é DRM.
- Uma publicação futura deve substituir a hospedagem antiga e remover quaisquer cópias públicas dos arquivos protegidos.
- Portas diferentes usam armazenamento de sessão distinto. O preview 8088 pode começar com uma nova sessão anônima e sem as estampas do preview 8087.
- Testar no celular o reconhecimento, coleta, recarga, áudio, AR, captura e os 3 personagens grátis antes de substituir a versão estável.

## Testes
node --experimental-vm-modules checks/security-test.mjs

Testes com respostas simuladas: IDs, permissão por personagem, sessão inválida, indisponibilidade do Supabase, caminhos codificados, HEAD, cache privado, JS e modelos sem dependências externas.

## Execução local
node checks/secure-preview.mjs
Somente 127.0.0.1:8088, sem publicação externa.

## Publicação futura
Usar o wrangler.jsonc desta cópia, que inclui main, binding ASSETS e run_worker_first.
Uma hospedagem puramente estática não executa o bloqueio.
As variáveis SUPABASE_URL e SUPABASE_PUBLISHABLE_KEY são públicas; nenhuma chave service_role é utilizada.
Referências:
https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
https://supabase.com/docs/reference/javascript/auth-getuser

