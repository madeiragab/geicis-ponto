# Decisões Arquiteturais

🇧🇷 **Português** | 🇺🇸 [English](../decisions.md)

As escolhas significativas feitas ao desenhar o sistema, e por quê. Cada uma
registra o que foi rejeitado, porque a opção rejeitada costuma ser a metade
mais interessante.

## Framework de backend

Django + Django REST Framework, igual ao projeto `social-network`. ORM maduro,
migrations, um admin que o coordenador ganha de graça, e um sistema de
permissões que não precisa ser inventado. O admin sozinho já elimina uma tela
inteira de CRUD do backlog do frontend.

## Autenticação

SimpleJWT com o mesmo formato do `social-network` — access 1h, refresh 7d,
header bearer — então existe um único padrão de autenticação para aprender
entre os dois projetos.

Três configurações são reforçadas aqui, porque registros de ponto são
documentos que justificam crédito acadêmico, não posts sociais:

- `ROTATE_REFRESH_TOKENS = True` e `BLACKLIST_AFTER_ROTATION = True`, então um
  refresh token vazado morre no próximo uso legítimo e o logout é real, não
  cosmético.
- Login limitado a 5/min por IP.
- Login por e-mail em vez de username, e a mesma mensagem de erro para um
  endereço desconhecido e uma senha errada, então o endpoint não pode ser
  usado para enumerar quem está no grupo.

## Estágio como o lado "1"

A especificação era: um professor tem vários alunos, um aluno tem vários
professores, e um aluno faz exatamente um estágio.

`Internship` é, portanto, modelado como um **estágio/vaga** — uma organização
ou projeto hospedeiro — que vários alunos do GEICIS podem compartilhar, com a
chave estrangeira em `StudentProfile`. Isso torna "um estágio por aluno" uma
propriedade do esquema, em vez de uma regra que alguém precisa lembrar de
validar.

Rejeitado: modelar `Internship` como uma linha por aluno, o que tornaria a
relação 1:1 e duplicaria o nome da organização e os detalhes do supervisor
para cada aluno mandado pro mesmo lugar.

Adiado: o *histórico* de estágios de um aluno. O esquema atual guarda um
estágio por aluno, sem registro do passado. Se o GEICIS precisar de histórico
depois, a migração é uma tabela de junção `StudentInternship` carregando
`started_at`, `ended_at`, e `is_current` — aditiva, e nenhum dado existente é
invalidado.

## Supervision como um model explícito

O relacionamento muitos-para-muitos professor↔aluno é uma tabela de verdade em
vez de um simples `ManyToManyField`, porque ele já carrega `role` (`ADVISOR` /
`CO_ADVISOR`) e `created_at`, e porque checagens de permissão o leem
constantemente. O mesmo raciocínio que o projeto `social-network` aplicou a
reações: tornar a relação explícita em vez de esconder regras dentro de um
vínculo implícito.

## Duração é calculada, nunca guardada

`TimeEntry` guarda `check_in` e `check_out`. Não guarda uma duração.

Uma duração guardada é uma segunda fonte de verdade, e a primeira correção que
um professor faz num timestamp a deixaria desatualizada. A subtração é barata,
e `(student_id, check_in)` é indexado, então queries de agregação continuam
rápidas sem uma coluna desnormalizada para manter honesta.

Se o grupo crescer além do ponto em que o agregado do ranking fica lento —
várias centenas de alunos, dezenas de milhares de registros — a solução é um
resumo materializado atualizado na escrita, não uma coluna de duração no
registro.

## `check_out IS NULL` significa aberto

Um registro aberto é aquele cujo `check_out` é nulo. Nenhuma coluna de status.

O ganho é o **índice único parcial em `student_id where check_out is null`**.
Ele torna "no máximo um registro aberto por aluno" uma garantia do banco em
vez de uma checagem de serializer, o que importa porque bater entrada é
exatamente o tipo de botão que recebe clique duplo num celular com conexão
lenta. Uma coluna de status não conseguiria expressar essa constraint de
forma tão limpa.

## Registros abertos não contam

Horas de um registro ainda aberto são excluídas dos totais, do ranking, e do
mínimo semanal.

A alternativa — contar o tempo decorrido de um registro aberto — faz o
ranking depender de quando você olha e recompensa um aluno que bate entrada e
vai embora. O custo é que esquecer de bater a saída perde a sessão até um
professor corrigir, o que é a pressão certa: bater a saída é trabalho do
aluno.

Registros parados são sinalizados depois de 16 horas, mas nunca fechados
automaticamente. Fechar automaticamente escreveria horas que ninguém
trabalhou num registro que existe para provar horas trabalhadas.

## Ranking por horas absolutas

O placar ordena pelo total de horas acumuladas, decrescente — não pelo
percentual da meta.

Alunos têm metas diferentes, então percentual é discutivelmente mais justo.
Também não é para isso que um placar de grupo serve: as pessoas comparam o
número bruto, e um aluno com 90% de uma meta de 120h acima de um aluno com
60% de uma meta de 400h soa errado para quem olha. O percentual ainda aparece
em cada linha como uma barra de progresso por aluno, então a comparação justa
fica visível sem ser o critério de ordenação.

Alunos concluídos permanecem no ranking. Removê-los apagaria silenciosamente
as pessoas que mais trabalharam.

## Mínimo semanal, não uma contagem regressiva de prazo

O e-mail de sexta compara as horas da semana contra um `weekly_minimum_hours`
por aluno, definido no cadastro.

Rejeitado: alertar qualquer um que ainda não tenha terminado o
`required_hours` total, o que mandaria e-mail para todo aluno ativo toda
sexta por meses e seria filtrado para o esquecimento na terceira semana.
Também rejeitado: derivar um ritmo esperado de `required_hours /
semanas_restantes`, o que é mais preciso mas produz uma meta móvel que os
alunos não conseguem prever, e transforma uma semana perdida numa exigência
permanentemente crescente.

Um número semanal fixo é a versão que um aluno consegue guardar na cabeça.

## O job semanal é um comando de gerenciamento, não Celery

`python manage.py send_weekly_alerts`, invocado pelo cron às `59 23 * * 5`.

Celery significaria um broker, um worker, e um processo beat — três peças
móveis e uma instância Redis para manter viva, para um job que roda uma vez
por semana. Cron mais um comando é uma fração da superfície operacional, é
trivialmente testável (`--dry-run`, `--week=YYYY-MM-DD`), e roda de forma
idêntica no laptop de um desenvolvedor.

Se o GEICIS precisar depois de agendamento por aluno ou novas tentativas com
backoff, Celery passa a valer a pena. Um job semanal não é isso.

## Idempotência através de uma constraint única

`unique(student_id, week_start)` em `WeeklyAlert`, e a linha é inserida
**antes** do e-mail ser enviado.

Isso torna o comando seguro para rodar de novo: uma segunda execução na mesma
sexta colide com a constraint e não manda nada. Reivindicar a linha primeiro é
o que protege a caixa de entrada do aluno — se o e-mail saísse primeiro e o
processo morresse antes do insert, uma nova tentativa mandaria um duplicado.
Inserir primeiro significa que uma queda deixa, no pior caso, uma linha
visível e corrigível em vez disso.

A linha de alerta é escrita também para falhas, com `delivery_status = FAILED`
e a mensagem de erro, então um problema de SMTP aparece para o coordenador em
vez de sumir.

## Fuso horário é `America/Sao_Paulo`

`USE_TZ = True`, armazenamento em UTC, `TIME_ZONE = 'America/Sao_Paulo'`.

Diferente do `social-network`, que roda em UTC, este sistema tem regras de
negócio ancoradas no horário local de parede: "sexta às 23:59" e "de qual
semana é esse registro". Em UTC, o job de sexta dispararia às 20:59 no
horário local e o limite de semana ficaria às 21:00 de domingo, deslocando
registros entre semanas silenciosamente.

Um registro pertence à semana do seu `check_in`, então uma sessão que cruza a
meia-noite ou um limite de semana conta inteira para a semana em que
começou. Dividi-la seria marginalmente mais preciso e consideravelmente mais
difícil de explicar para um aluno olhando os próprios números.

## Conclusão é confirmada, não automática

Atingir `required_hours` não muda automaticamente o status de um aluno para
`COMPLETED`. Um coordenador faz isso.

Terminar um estágio é um ato administrativo com papelada por trás. A
contagem de horas do sistema é evidência para essa decisão, e fingir o
contrário tornaria o software a autoridade sobre algo que não é.

## Regras de negócio vivem no backend

Toda regra em [business-rules.md](business-rules.md) é aplicada pela API. O
frontend espelha algumas por responsividade — escondendo o botão de bater
entrada quando há um registro aberto — mas a API recusa a requisição de
qualquer forma. O frontend é um cliente não confiável, a mesma posição que o
projeto `social-network` adota.

## Registros fora do escopo retornam 404

Um professor pedindo um aluno que não orienta recebe `404`, não `403`. Um
`403` confirmaria que o registro existe para alguém que não deveria saber
disso.

## Fora de escopo, deliberadamente

| Não construindo                       | Por quê                                                       |
| ---------------------------------------- | ---------------------------------------------------------------- |
| Geolocalização / ponto preso a IP        | Vigilância de alunos, para um grupo de estudos construído sobre confiança |
| Ponto por foto ou biometria              | O mesmo, mais uma categoria inteira de obrigação de proteção de dados |
| Aplicativo mobile                        | Um web app responsivo cobre a única interação que importa       |
| Atualizações em tempo real (WebSocket)   | Nada aqui muda segundo a segundo, exceto um timer local          |
| Certificados de horas em PDF automáticos | Valor real, mas precisa do modelo da instituição primeiro        |
| Suporte multi-grupo / multi-tenant       | O sistema é para o GEICIS; generalizar agora é especulativo      |
| Escalas e turnos                         | Isso registra horas trabalhadas, não horas planejadas            |

A exportação de certificado é a adição mais provável assim que o formato
institucional for conhecido.
