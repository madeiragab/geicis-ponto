# Regras de Negócio

🇧🇷 **Português** | 🇺🇸 [English](../business-rules.md)

Toda regra listada aqui é aplicada pelo backend. O frontend pode espelhar
algumas por questão de responsividade, mas a API é a autoridade.

## Cadastro

- Um aluno se cadastra com: e-mail, nome completo, senha, matrícula, estágio,
  **carga horária total exigida**, e **mínimo semanal de horas**.
- `required_hours` é perguntado uma vez, no cadastro, e só um coordenador pode
  alterá-la depois. Um aluno não pode diminuir a própria meta.
- Os dois valores de horas devem ser positivos, e `weekly_minimum_hours` não
  pode exceder `required_hours`.
- E-mail e matrícula são únicos no sistema.
- Professores e coordenadores são criados por um coordenador, não por
  autoatendimento. Não existe caminho público para um papel privilegiado.

## Bater entrada

`POST /api/time-entries/check-in/`

1. Quem chama precisa ser um `STUDENT` ativo cujo status de perfil seja `ACTIVE`.
2. O aluno precisa **não ter registro aberto**. Se houver um, a requisição é
   recusada com `409 ENTRY_ALREADY_OPEN` e o registro aberto é retornado para
   que a UI possa mostrá-lo em vez disso.
3. `check_in` é definido no servidor como `timezone.now()`. O cliente não envia
   um timestamp — isso seria trivialmente falsificável.
4. `notes` pode ser fornecido e é opcional.

Um aluno cujo status seja `COMPLETED`, `SUSPENDED`, ou `WITHDRAWN` não pode
bater ponto. Suas horas históricas continuam visíveis e ainda contam no ranking.

## Bater saída

`POST /api/time-entries/check-out/`

1. O aluno precisa ter exatamente um registro aberto, senão `409 NO_OPEN_ENTRY`.
2. `check_out` é definido no servidor como `timezone.now()`.
3. `check_out > check_in` é garantido pelo relógio, e reforçado por uma
   constraint de banco de qualquer forma.
4. A resposta inclui o registro fechado com sua duração calculada e os totais
   atualizados do aluno, então a UI não precisa de uma segunda requisição.

### Registros deixados abertos

Um aluno que esquece de bater a saída deixa um registro aberto
indefinidamente. Duas mitigações, ambas deliberadas:

- **O registro aberto não conta** para os totais, o ranking, ou o mínimo
  semanal. Só registros fechados são contados. Esquecer de bater a saída custa
  a sessão pro aluno, o que é o incentivo correto.
- **Uma varredura noturna** sinaliza registros abertos há mais de 16 horas.
  Eles não são fechados automaticamente nem apagados — o aluno vê um aviso e
  pede a um professor para corrigir o registro. Fechar automaticamente
  inventaria horas que ninguém trabalhou.

## Correções

- Um professor pode corrigir os registros dos alunos que orienta. Um
  coordenador pode corrigir qualquer registro.
- Um aluno **nunca** pode editar `check_in` ou `check_out`, nem nos próprios
  registros nem nos de outros. Ele pode editar `notes` nos próprios registros.
- Toda correção exige `adjustment_reason` e marca `adjusted_by`. Registros
  corrigidos são marcados visivelmente na UI e na resposta da API.

## Cálculo de horas

A unidade em todo lugar é **horas em decimal**, arredondada para duas casas no
momento da exibição.

```
duracao(registro) = check_out - check_in     # só quando check_out não é nulo
total_horas(aluno) = Σ duracao(registros fechados desse aluno)
horas_restantes(aluno) = max(0, required_hours - total_horas)
percentual_conclusao(aluno) = min(100, total_horas / required_hours * 100)
```

Implementado como um único agregado, não um loop em Python:

```python
StudentProfile.objects.annotate(
    total_hours=Coalesce(
        Sum(F('time_entries__check_out') - F('time_entries__check_in'),
            filter=Q(time_entries__check_out__isnull=False)),
        timedelta(0),
    )
)
```

`completion_percentage` é limitado a 100, mas `total_hours` não é: um aluno que
trabalha além da meta continua acumulando, e o ranking reflete isso.

## Semanas

Uma semana vai de **segunda 00:00:00 a domingo 23:59:59,999** em
`America/Sao_Paulo`.

Um registro pertence à semana do seu **`check_in`**. Uma sessão que começa às
23:30 de sexta e termina 01:15 de sábado conta inteira para a semana de sexta.
Dividir sessões entre limites de semana tornaria a aritmética inexplicável
para os alunos, e o caso é raro.

`week_start` é sempre a data de segunda-feira, e é a chave usada por
`WeeklyAlert`.

## Ranking

`GET /api/ranking/`

- Ordenado por **total de horas acumuladas, decrescente**. Horas absolutas,
  não percentual da meta — o ranking é um placar de grupo, e o número bruto é
  o que as pessoas comparam.
- Só registros fechados contam.
- Todos os alunos aparecem, incluindo os `COMPLETED`, então alunos que
  terminaram não somem do quadro.
- Empates compartilham posição: dois alunos com 40h são ambos 3º, e o próximo
  é 5º (ranking de competição padrão).
- O ranking é público para qualquer usuário autenticado. Todo mundo no GEICIS
  vê os totais de todo mundo — esse é o ponto dele.
- Cada linha carrega: posição, nome, estágio, horas totais, horas nesta
  semana, e percentual da meta do próprio aluno.

## Alerta semanal

A regra pela qual todo o agendador existe.

**Quando** — toda sexta às 23:59, `America/Sao_Paulo`, via cron:

```
59 23 * * 5   cd /srv/geicis-ponto/backend && python manage.py send_weekly_alerts
```

**Quem recebe um e-mail** — um aluno é alertado quando *todos* estes forem verdade:

1. `status == ACTIVE`
2. `user.is_active` é verdadeiro
3. horas registradas na semana atual (segunda 00:00 → o momento em que o job
   roda) são **estritamente menores** que `weekly_minimum_hours`
4. ainda não existe um `WeeklyAlert` para aquele `(student, week_start)`

A condição 4 é o que torna o comando **idempotente**. Rodá-lo duas vezes na
mesma sexta não manda nada na segunda vez, então uma nova tentativa depois de
uma queda é segura e disparos indevidos do cron são inofensivos.

**O que o e-mail diz** — o nome do aluno, horas registradas nesta semana, o
mínimo semanal, a diferença que falta, o total acumulado contra
`required_hours`, e um link para o painel. Direto, sem repreender. É um
lembrete, não uma punição.

**Registrado de qualquer forma** — uma linha de `WeeklyAlert` é escrita quer o
SMTP tenha sucesso ou falhe, com `delivery_status` definido de acordo. Uma
falha precisa ser visível para o coordenador em vez de silenciosamente
engolida, e a linha ainda bloqueia um envio duplicado.

**Note a interação com registro aberto:** um aluno que bateu ponto às 23:59 de
sexta tem um registro aberto, e registros abertos não contam. Se aquela sessão
tivesse feito ele passar do mínimo, ele ainda recebe o e-mail. Esse é um
detalhe conhecido e aceito — bater a saída é responsabilidade do aluno, e a
alternativa é contar horas que ainda não foram trabalhadas.

## Matriz de permissões

| Ação                                 | Aluno          | Professor               | Coordenador |
| -------------------------------------- | -------------- | ------------------------- | ----------- |
| Bater entrada / saída                  | só a própria   | —                        | —           |
| Ver os próprios registros              | ✓              | ✓                        | ✓           |
| Ver registros de outro aluno           | ✗              | só quem orienta          | ✓           |
| Corrigir um registro                   | ✗              | só quem orienta          | ✓           |
| Editar observações do próprio registro | ✓              | ✓                        | ✓           |
| Ver o ranking                          | ✓              | ✓                        | ✓           |
| Criar/editar estágios                  | ✗              | ✗                        | ✓           |
| Criar professores/coordenadores        | ✗              | ✗                        | ✓           |
| Vincular professor ↔ aluno             | ✗              | ✗                        | ✓           |
| Mudar o `required_hours` de um aluno   | ✗              | ✗                        | ✓           |
| Ver alertas semanais                   | só os próprios | só de quem orienta       | ✓           |
