# Diagramas de Estado

🇧🇷 **Português** | 🇺🇸 [English](../../diagrams/state-diagram.md)

## TimeEntry

Um registro tem dois estados reais. O terceiro é uma sinalização, não um
estado — um registro ajustado continua fechado.

```mermaid
stateDiagram-v2
    [*] --> Aberto : POST /check-in/<br/>check_in = now(), check_out = NULL

    Aberto --> Fechado : POST /check-out/<br/>check_out = now()
    Aberto --> Fechado : PATCH por professor/coordenador<br/>(saída esquecida)
    Aberto --> Parado : varredura noturna,<br/>aberto há mais de 16h

    Parado --> Fechado : PATCH por professor/coordenador<br/>+ adjustment_reason
    Parado --> [*] : DELETE pelo coordenador

    Fechado --> Fechado : PATCH nos timestamps<br/>+ adjustment_reason → adjusted_by definido
    Fechado --> [*] : DELETE pelo coordenador

    note right of Aberto
        NÃO conta para totais,
        ranking, ou mínimo semanal.
        No máximo um por aluno —
        índice único parcial.
    end note

    note right of Parado
        Uma sinalização, não uma coluna:
        check_out IS NULL e o
        check_in é mais antigo que 16h.
        Nunca fechado automaticamente — isso
        inventaria horas que ninguém trabalhou.
    end note
```

## StudentProfile

```mermaid
stateDiagram-v2
    [*] --> Ativo : POST /auth/register/

    Ativo --> Concluído : total_hours atinge required_hours<br/>(coordenador confirma)
    Ativo --> Suspenso : coordenador
    Ativo --> Desligado : coordenador

    Suspenso --> Ativo : coordenador
    Concluído --> Ativo : coordenador reabre<br/>(meta aumentada)

    Desligado --> [*]

    note right of Ativo
        O único estado que pode bater ponto
        e o único estado que o alerta
        de sexta avalia.
    end note

    note left of Concluído
        Mantém toda hora registrada e
        continua no ranking. Alunos
        que terminaram não desaparecem
        do quadro.
    end note
```

Atingir `required_hours` **não** muda o status automaticamente. Um
coordenador confirma isso, porque concluir um estágio é um ato administrativo
com papelada por trás, e as horas no sistema são evidência para essa decisão,
não a decisão em si.

## Ciclo de avaliação semanal

Onde um aluno se encontra dentro de uma semana, do ponto de vista do alerta.

```mermaid
stateDiagram-v2
    [*] --> AbaixoDoMinimo : Segunda 00:00<br/>horas_semana = 0

    AbaixoDoMinimo --> MinimoBatido : horas fechadas acumuladas<br/>alcançam weekly_minimum_hours
    MinimoBatido --> MinimoBatido : continua registrando

    AbaixoDoMinimo --> Alertado : Sexta 23:59<br/>ainda abaixo → e-mail + linha de WeeklyAlert
    MinimoBatido --> [*] : Sexta 23:59 → nada enviado

    Alertado --> Alertado : nova execução do comando<br/>→ pulado, unique(student, week_start)
    Alertado --> [*] : a semana termina

    note right of AbaixoDoMinimo
        Só registros FECHADOS tiram um aluno
        desse estado. Uma sessão ainda
        rodando às 23:59 de sexta não
        conta — e o e-mail é enviado.
    end note
```
