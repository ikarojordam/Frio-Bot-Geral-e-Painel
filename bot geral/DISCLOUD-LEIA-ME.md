# Implantação Discloud

O arquivo discloud.config está na raiz do ZIP. Configure as variáveis de ambiente no painel da hospedagem. Não coloque tokens reais no ZIP.

Este bot também possui APIs e callback OAuth via Express. O plano **bot** da Discloud não fornece uma URL pública HTTP; para manter painel e verificação OAuth, use hospedagem web com HTTPS separada ou uma modalidade **site** que exponha porta HTTP. Configure REDIRECT_URI para a URL pública exata /callback, e a mesma URL no Developer Portal do Discord. Sem isso, as funções HTTP/OAuth não funcionarão.

Painéis /dev e /admin agora têm tela inicial Components V2 com select menus, mantendo subpainéis existentes acessíveis por respostas privadas. A maioria dos subpainéis internos ainda é legado; a migração completa de todas as telas exige revisão de cada fluxo.

Verificados: o botão antigo que movia automaticamente todos os usuários foi substituído por convite voluntário com limite de usos; a quantidade de usos não garante a quantidade de pessoas que efetivamente entrarão.

Antes de subir, verifique que o token do bot e credenciais do banco foram revogados e rotacionados caso tenham sido publicados anteriormente.
