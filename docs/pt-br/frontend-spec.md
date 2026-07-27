# Especificação do Frontend

🇧🇷 **Português** | 🇺🇸 [English](../frontend-spec.md)

React + Vite + Tailwind CSS, a mesma stack do frontend do `social-network`
(axios, lucide-react, clsx, tailwind-merge). Uma SPA que consome a API REST e
não renderiza nada no servidor.

## Direção de design

O sistema é usado em rajadas curtas — um aluno abre, toca um botão, e sai.
Tudo é organizado em torno disso.

- **Uma ação primária por tela.** No painel do aluno é um único botão grande
  que é "Bater entrada" ou "Bater saída". Nunca os dois.
- **Números são o ornamento.** Contadores grandes de horas, um anel de
  progresso, um pódio de ranking. Não existe ilustração decorativa em lugar
  nenhum — o dado é o interesse visual.
- **Movimento significa algo.** O timer rodando marca os segundos, a barra de
  progresso anima quando cresce, as linhas do ranking entram escalonadas ao
  carregar. Nada anima que não esteja reportando uma mudança.
- **Claro e escuro**, seguindo `prefers-color-scheme` com um alternador manual.

### Paleta

| Token         | Claro                | Escuro                | Usado para                     |
| ------------- | --------------------- | --------------------- | -------------------------------- |
| `surface`     | `slate-50`            | `slate-950`           | fundo da página                  |
| `card`        | `white`               | `slate-900`           | painéis                          |
| `border`      | `slate-200`           | `slate-800`           | divisores                        |
| `text`        | `slate-900`           | `slate-100`           | texto primário                   |
| `muted`       | `slate-500`           | `slate-400`           | rótulos, texto secundário        |
| `primary`     | `indigo-600`          | `indigo-400`          | bater ponto, links, estados ativos |
| `running`     | `emerald-500`         | `emerald-400`         | registro em aberto, metas batidas |
| `warning`     | `amber-500`           | `amber-400`           | abaixo do mínimo semanal          |
| `danger`      | `rose-500`            | `rose-400`            | registros parados, destrutivo    |

Semântico, não decorativo: verde sempre significa "contando ou na meta",
âmbar sempre significa "atrasado", rosa sempre significa "algo está errado
com esse registro".

Acessibilidade: todo par atende WCAG AA (4,5:1) nos dois temas, e o status
nunca é carregado só pela cor — o badge tem um rótulo e um ícone também.

## Telas

### `/login`
E-mail e senha, card centralizado, marca do GEICIS. No sucesso, guarda o par
de tokens e redireciona pelo papel. Uma mensagem de erro genérica para
credenciais inválidas.

### `/cadastro`
Autocadastro de aluno. Dois passos, para o formulário nunca parecer uma
parede:

1. Identidade — nome, e-mail, matrícula, senha + confirmação, com um medidor
   de força ao vivo espelhando os validadores do Django.
2. Estágio — seleção de estágio (do `?minimal=true`), **carga horária total
   exigida**, **mínimo semanal de horas**, data de início, data prevista de
   término.

O passo 2 mostra uma frase ao vivo abaixo dos campos: *"20h/semana até
15/12/2026 dá cerca de 400h — sua meta é 300h."* É uma dica, não uma
validação; só torna óbvio um par de números irrealista antes de enviar.

### `/` — Painel do aluno

A tela que importa. De cima para baixo:

1. **O botão.** Largura total, alto, impossível de perder.
   - Parado → índigo, "Bater entrada".
   - Rodando → esmeralda, "Bater saída", com um timer `HH:MM:SS` ao vivo
     contando a partir do `check_in` e uma pulsação suave na borda. O timer é
     calculado a partir do `check_in` do servidor, nunca de um momento de
     início no cliente, então um refresh de página ou um laptop hibernado não
     conseguem desviá-lo.
2. **Anel de progresso** — `completion_percentage`, com `total_hours` de
   `required_hours` no meio e `remaining_hours` abaixo.
3. **Faixa da semana** — sete células, segunda a domingo, preenchidas pelas
   horas registradas por dia, com o mínimo semanal desenhado como uma linha
   sobre elas. Âmbar enquanto a semana está curta, esmeralda quando o mínimo
   é batido.
4. **Card de posição no ranking** — "4º de 23", clicável até `/ranking`.
5. **Registros recentes** — os últimos dez, data, entrada, saída, duração, e
   um badge "ajustado" onde `adjusted_by` está definido.

Se um registro está aberto há mais de 16 horas, uma faixa rosa fica acima de
tudo: *"Você tem um ponto aberto desde sexta às 14:02. Peça a um professor
para corrigir."*

### `/ranking`

A tela que o grupo de fato abre.

- **Gráfico de barras com fotos** — uma barra horizontal por aluno, foto do
  aluno na ponta esquerda, comprimento da barra proporcional ao total de
  horas. "Você" é destacado com um anel no avatar, não uma cor diferente na
  barra — identidade segue a pessoa, não a posição.
- **Tabela** abaixo: posição, nome, estágio, horas totais, horas nesta
  semana, e uma barra de progresso fina por linha para o percentual próprio
  do aluno. A linha do usuário atual é destacada e gruda no rodapé da
  viewport quando sai de vista, então você nunca perde sua própria linha.
- **Filtros**: estágio, professor, só ativos.
- Linhas entram escalonadas ao carregar, e posições animam quando a lista se
  reordena depois de uma saída de ponto.

A ordenação é por horas absolutas. A barra de percentual é contexto, não o
critério de ordenação.

### `/registros`
Histórico completo, paginado, filtrável por intervalo de datas e semana.
Exportação CSV para o coordenador.

### `/students/:id`
Tudo do painel do aluno, somente leitura, para supervisores. Adiciona o
diálogo de correção para professores — define o timestamp faltante, digita o
motivo, envia. O campo de motivo é obrigatório e o botão de envio fica
desabilitado até ter conteúdo.

### `/coordenacao` — Coordenador
Uma requisição para `/api/dashboard/`: contagens por status, total do grupo,
quem está com ponto aberto agora, quem está abaixo do mínimo semanal, top 5.
Mais CRUD para estágios, alunos, professores, e os vínculos professor↔aluno,
e o log de alertas semanais com um filtro para `delivery_status=FAILED`.

### `/perfil`
Foto de perfil (com foto padrão trocável por upload) e troca de senha.

## Componentes

```
components/
├── ui/            Button, Card, Badge, Modal, Input, Select, Toast, Skeleton
├── ClockButton    a máquina de estados: parado | rodando | enviando | erro
├── LiveTimer      marca a partir de um check_in do servidor, à prova de dessincronia
├── ProgressRing   anel SVG, arco animado
├── WeekStrip      sete células de dia + a linha do mínimo
├── RankingChart   gráfico de barras horizontais com fotos dos alunos
├── RankingTable   ordenável, linha própria fixa
├── EntryRow       um registro de ponto + badge de ajustado
├── EntryAdjustModal
└── StatCard       rótulo, número grande, variação
```

## Fluxo de dados

- Instância `axios` com um interceptor de requisição anexando o token bearer,
  e um interceptor de resposta que captura `401 TOKEN_EXPIRED`, atualiza uma
  vez, e repete a requisição original. 401s concorrentes enfileiram atrás de
  uma única atualização.
- `AuthContext` guarda o usuário, o papel, e o par de tokens. Tokens vivem em
  memória com o refresh token em `localStorage` como alternativa documentada,
  com seu trade-off reconhecido.
- Guardas de rota por papel. Guardas são só conveniência — a API aplica as
  mesmas regras, então uma rota editada à mão chega a um 403, não a dados.
- `POST /check-out/` retorna o resumo atualizado, então o painel atualiza a
  partir da resposta. Sem nova busca, sem flash de números desatualizados.
- `GET /time-entries/current/` roda ao montar e ao focar a janela, que é como
  um aluno que bateu ponto no celular vê o timer rodando no laptop.

## Tratamento de erros

A API retorna `error.message` como texto em português voltado ao usuário,
então ele renderiza direto num toast. O frontend ramifica em `error.code`
para os dois que precisam de tratamento especial:

| Código               | Resposta da UI                                              |
| ---------------------- | -------------------------------------------------------------- |
| `ENTRY_ALREADY_OPEN` | troca para o estado rodando usando o registro em `details`     |
| `NO_OPEN_ENTRY`      | troca para o estado parado e busca `current` de novo            |
| todos os outros       | toast com `error.message`                                       |

Os dois casos especiais significam que a UI se dessincronizou do servidor.
Nenhum mostra um erro — a tela só se corrige sozinha, porque o aluno não fez
nada de errado.

## Responsividade

Mobile first. Alunos batem ponto pelo celular, em pé, muitas vezes na
entrada ou saída. O botão de ponto fica ao alcance do polegar no rodapé da
viewport em telas pequenas, a tabela de ranking vira cards abaixo de `sm`, e
o painel do coordenador é a única tela que assume uma largura de desktop.
