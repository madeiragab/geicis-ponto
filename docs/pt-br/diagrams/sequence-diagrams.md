# Diagramas de Sequência

🇧🇷 **Português** | 🇺🇸 [English](../../diagrams/sequence-diagrams.md)

Os quatro fluxos que foram modelados antes da implementação.

---

## 1. Cadastro do aluno

O único fluxo onde `required_hours` e `weekly_minimum_hours` são coletados.

```mermaid
sequenceDiagram
    autonumber
    actor S as Aluno
    participant UI as React SPA
    participant API as API DRF
    participant DB as Banco de dados

    S->>UI: abre /cadastro
    UI->>API: GET /api/internships/?active=true&minimal=true
    API->>DB: SELECT estágios ativos
    DB-->>API: lista
    API-->>UI: 200 estágios
    UI-->>S: formulário com seleção de estágio

    S->>UI: nome, e-mail, senha, matrícula,<br/>estágio, carga horária, mínimo semanal
    UI->>API: POST /api/auth/register/

    API->>API: valida senha (4 validadores)
    API->>API: required_hours é positivo<br/>weekly_minimum não é maior que required_hours

    alt validação falha
        API-->>UI: 400 VALIDATION_ERROR
        UI-->>S: erros por campo
    else válido
        API->>DB: BEGIN
        API->>DB: INSERT User (role=STUDENT, senha com hash)
        API->>DB: INSERT StudentProfile (metas, FK do estágio)
        API->>DB: COMMIT
        Note over DB: unique(email) e unique(registration_number)<br/>recusam duplicatas aqui, não em Python
        DB-->>API: criado
        API-->>UI: 201 usuário + perfil
        UI->>API: POST /api/auth/token/
        API-->>UI: access + refresh
        UI-->>S: redireciona pro painel
    end
```

---

## 2. Bater entrada e saída

A interação central. Dois botões, e só um deles visível por vez.

```mermaid
sequenceDiagram
    autonumber
    actor S as Aluno
    participant UI as React SPA
    participant API as API DRF
    participant SVC as TimesheetService
    participant DB as Banco de dados

    Note over S,DB: — carregamento da página —
    UI->>API: GET /api/time-entries/current/
    API->>DB: SELECT registro WHERE aluno=eu AND check_out IS NULL
    DB-->>API: nenhum
    API-->>UI: { open_entry: null }
    UI-->>S: renderiza "Bater entrada"

    Note over S,DB: — bater entrada —
    S->>UI: clica "Bater entrada"
    UI->>API: POST /api/time-entries/check-in/
    API->>SVC: clock_in(aluno, notas)
    SVC->>SVC: aluno.status == ACTIVE?
    SVC->>DB: INSERT TimeEntry (check_in = now(), check_out = NULL)

    alt uma segunda requisição concorre com a primeira
        DB-->>SVC: IntegrityError — único parcial em registros abertos
        SVC-->>API: lança EntryAlreadyOpen
        API-->>UI: 409 ENTRY_ALREADY_OPEN + registro existente
        UI-->>S: mostra o timer rodando em vez disso
    else a primeira requisição vence
        DB-->>SVC: registro #881
        SVC-->>API: registro
        API-->>UI: 201 registro
        UI-->>S: timer rodando, botão "Bater saída"
    end

    Note over S,DB: — horas depois —
    S->>UI: clica "Bater saída"
    UI->>API: POST /api/time-entries/check-out/
    API->>SVC: clock_out(aluno)
    SVC->>DB: SELECT registro aberto FOR UPDATE

    alt sem registro aberto
        DB-->>SVC: nenhum
        API-->>UI: 409 NO_OPEN_ENTRY
    else encontrado
        SVC->>DB: UPDATE check_out = now()
        Note over DB: constraint CHECK vale —<br/>check_out é depois de check_in
        SVC->>DB: SELECT SUM(check_out - check_in) para os totais
        DB-->>SVC: 147,0h total, 16,49h nesta semana
        SVC-->>API: registro + resumo
        API-->>UI: 200 { registro, resumo }
        UI-->>S: duração, total atualizado, barra de progresso,<br/>nova posição no ranking — sem segunda requisição
    end
```

---

## 3. Ranking

```mermaid
sequenceDiagram
    autonumber
    actor U as Qualquer usuário autenticado
    participant UI as React SPA
    participant API as API DRF
    participant RS as RankingService
    participant DB as Banco de dados

    U->>UI: abre /ranking
    UI->>API: GET /api/ranking/?internship=3
    API->>RS: build(filtros)

    RS->>DB: SELECT aluno, user.full_name, internship.title,<br/>SUM(check_out - check_in) AS total_hours<br/>FROM aluno LEFT JOIN registro_ponto<br/>WHERE check_out IS NOT NULL<br/>GROUP BY aluno ORDER BY total_hours DESC

    Note over DB: uma query, índice (student_id, check_in)<br/>registros abertos excluídos pelo WHERE

    DB-->>RS: linhas ordenadas
    RS->>RS: atribui posições,<br/>empates compartilham posição
    RS-->>API: linhas
    API-->>UI: 200 { generated_at, results }
    UI-->>U: gráfico de barras com fotos, tabela abaixo,<br/>linha própria destacada
```

---

## 4. Alerta semanal — Sexta 23:59

O fluxo pelo qual o agendador inteiro existe.

```mermaid
sequenceDiagram
    autonumber
    participant Cron as cron (sexta 23:59)
    participant CMD as send_weekly_alerts
    participant SVC as WeeklyAlertService
    participant DB as Banco de dados
    participant SMTP as SMTP
    actor S as Aluno

    Cron->>CMD: manage.py send_weekly_alerts
    CMD->>SVC: run(hoje)
    SVC->>SVC: segunda = week_start(hoje)<br/>America/Sao_Paulo

    SVC->>DB: SELECT alunos WHERE status = ACTIVE<br/>AND user.is_active<br/>ANOTA week_hours = SUM(registros fechados desde segunda)<br/>HAVING week_hours abaixo de weekly_minimum_hours
    DB-->>SVC: candidatos

    loop para cada candidato
        SVC->>DB: INSERT WeeklyAlert (aluno, segunda, ...)

        alt alerta já existe para (aluno, segunda)
            DB-->>SVC: IntegrityError — unique(student, week_start)
            SVC->>SVC: pula — já avisado nesta semana
            Note over SVC: isso é o que torna uma nova execução inofensiva
        else linha nova
            DB-->>SVC: alerta #40
            SVC->>SMTP: envia e-mail — horas registradas,<br/>mínimo, diferença, total acumulado, link

            alt entrega ok
                SMTP-->>SVC: aceito
                SVC->>DB: UPDATE delivery_status = SENT
                SMTP-->>S: 📧 lembrete
            else entrega falhou
                SMTP-->>SVC: erro
                SVC->>DB: UPDATE delivery_status = FAILED,<br/>error_message = ...
                Note over DB: a linha permanece — o coordenador<br/>vê a falha em /weekly-alerts/?delivery_status=FAILED
            end
        end
    end

    SVC-->>CMD: AlertReport (avaliados, enviados, pulados, falhas)
    CMD-->>Cron: imprime o relatório, exit 0
```

**Por que a linha de `WeeklyAlert` é escrita antes do e-mail ser enviado:** a
constraint única precisa ser reivindicada primeiro. Se o e-mail saísse
primeiro e o processo morresse antes do insert, uma nova tentativa mandaria
e-mail duplicado pro aluno. Na outra ordem, uma queda deixa, no pior caso,
uma linha cujo `delivery_status` nunca saiu do valor inicial — visível,
corrigível, e não um duplicado na caixa de entrada de alguém.

---

## 5. Professor corrige um ponto esquecido

```mermaid
sequenceDiagram
    autonumber
    actor P as Professor
    participant UI as React SPA
    participant API as API DRF
    participant DB as Banco de dados

    P->>UI: abre os registros de um aluno que orienta
    UI->>API: GET /api/time-entries/?student=12
    API->>DB: checa Supervision(professor=eu, student=12)
    alt não orienta
        API-->>UI: 404 NOT_FOUND
        Note over API: 404, não 403 — a API não confirma<br/>que um registro existe para quem talvez não possa ver
    else orienta
        DB-->>API: registros
        API-->>UI: 200 (registro #881 sinalizado: aberto há 19h)
    end

    P->>UI: define check_out, digita o motivo
    UI->>API: PATCH /api/time-entries/881/
    API->>API: adjustment_reason presente?
    alt ausente
        API-->>UI: 400 ADJUSTMENT_REASON_REQUIRED
    else presente
        API->>DB: UPDATE check_out, adjusted_by = eu, adjustment_reason
        DB-->>API: ok
        API-->>UI: 200 registro (marcado como ajustado)
        UI-->>P: linha mostra o badge "ajustado" e o motivo ao passar o mouse
    end
```
