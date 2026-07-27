# Diagrama Entidade-Relacionamento

🇧🇷 **Português** | 🇺🇸 [English](../../diagrams/er-diagram.md)

Esquema relacional. As regras a nível de campo estão em
[../data-model.md](../data-model.md).

```mermaid
erDiagram
    USER ||--o| STUDENT_PROFILE   : "é"
    USER ||--o| PROFESSOR_PROFILE : "é"
    USER ||--o{ TIME_ENTRY        : "ajusta"

    INTERNSHIP ||--o{ STUDENT_PROFILE : "hospeda"

    PROFESSOR_PROFILE ||--o{ SUPERVISION : "orienta através de"
    STUDENT_PROFILE   ||--o{ SUPERVISION : "orientado através de"

    STUDENT_PROFILE ||--o{ TIME_ENTRY   : "registra"
    STUDENT_PROFILE ||--o{ WEEKLY_ALERT : "recebe"

    USER {
        bigint   id PK
        varchar  email UK "identificador de login"
        varchar  full_name
        varchar  role "STUDENT|PROFESSOR|COORDINATOR"
        varchar  password "hash PBKDF2"
        boolean  is_active
        boolean  is_staff
        datetime date_joined
        datetime last_login
    }

    STUDENT_PROFILE {
        bigint   id PK
        bigint   user_id FK,UK
        varchar  registration_number UK
        bigint   internship_id FK "PROTECT, anulável"
        int      required_hours "perguntado no cadastro"
        int      weekly_minimum_hours "dispara o alerta de sexta"
        date     started_at
        date     expected_end_at "anulável"
        varchar  status "ACTIVE|COMPLETED|SUSPENDED|WITHDRAWN"
        datetime created_at
        datetime updated_at
    }

    PROFESSOR_PROFILE {
        bigint   id PK
        bigint   user_id FK,UK
        varchar  siape UK "anulável"
        varchar  department
        datetime created_at
    }

    INTERNSHIP {
        bigint   id PK
        varchar  title
        varchar  organization
        text     description
        varchar  supervisor_name
        varchar  supervisor_email
        boolean  is_active
        datetime created_at
        datetime updated_at
    }

    SUPERVISION {
        bigint   id PK
        bigint   professor_id FK
        bigint   student_id FK
        varchar  role "ADVISOR|CO_ADVISOR"
        datetime created_at
    }

    TIME_ENTRY {
        bigint   id PK
        bigint   student_id FK
        datetime check_in
        datetime check_out "NULL significa aberto"
        varchar  notes
        bigint   adjusted_by_id FK "anulável, SET_NULL"
        varchar  adjustment_reason
        datetime created_at
        datetime updated_at
    }

    WEEKLY_ALERT {
        bigint   id PK
        bigint   student_id FK
        date     week_start "a segunda-feira"
        decimal  hours_logged
        decimal  minimum_required
        datetime sent_at
        varchar  delivery_status "SENT|FAILED"
        varchar  error_message
    }
```

## As duas relações que foram especificadas explicitamente

```mermaid
flowchart TB
    subgraph M2M["Professor ↔ Aluno — N:M"]
        direction LR
        P1["Prof. Ana"] --- S1["Maria"]
        P1 --- S2["João"]
        P2["Prof. Bruno"] --- S1
        P2 --- S3["Lucas"]
    end

    subgraph O2M["Estágio → Aluno — 1:N"]
        direction LR
        I1["Estágio<br/>TRE-PE"] --> A1["Maria"]
        I1 --> A2["João"]
        I2["Estágio<br/>UFPE Labs"] --> A3["Lucas"]
    end
```

Um professor tem vários alunos e um aluno tem vários professores, então o
par precisa da tabela de junção `SUPERVISION`. Um estágio hospeda vários
alunos mas um aluno tem exatamente um estágio, então uma única chave
estrangeira em `STUDENT_PROFILE` basta — sem tabela de junção, e a regra "só
um estágio" é estrutural em vez de validada.

## Constraints que vivem no banco

Essas são de nível banco de dados, não de nível serializer. Uma corrida, uma
nova tentativa, ou uma sessão direta no `psql` não consegue contorná-las.

| Tabela             | Constraint                                             | Protege contra                        |
| ------------------- | ---------------------------------------------------------- | --------------------------------------- |
| `USER`             | `unique(email)`                                            | contas duplicadas                       |
| `STUDENT_PROFILE`  | `unique(registration_number)`                              | alunos duplicados                       |
| `STUDENT_PROFILE`  | `required_hours > 0`, `weekly_minimum_hours > 0`          | metas sem sentido                        |
| `STUDENT_PROFILE`  | `weekly_minimum_hours <= required_hours`                  | meta semanal inatingível                 |
| `STUDENT_PROFILE`  | `expected_end_at >= started_at`                           | período invertido                        |
| `STUDENT_PROFILE`  | FK `internship` `ON DELETE PROTECT`                       | deixar registros de horas órfãos         |
| `INTERNSHIP`       | `unique(title, organization)`                             | estágios duplicados                      |
| `SUPERVISION`      | `unique(professor_id, student_id)`                        | vínculos duplicados                      |
| `SUPERVISION`      | `unique(student_id) where role='ADVISOR'` (parcial)       | dois orientadores principais             |
| `TIME_ENTRY`       | `check_out IS NULL OR check_out > check_in`               | durações negativas                       |
| `TIME_ENTRY`       | **`unique(student_id) where check_out IS NULL`** (parcial) | dois registros abertos por clique duplo  |
| `TIME_ENTRY`       | índice `(student_id, check_in)`                            | queries lentas de ranking e semana        |
| `WEEKLY_ALERT`     | `unique(student_id, week_start)`                           | e-mails de sexta duplicados               |

As duas em negrito importam mais: o índice único parcial em registros
abertos é o que torna bater entrada seguro sob clique duplo, e o único em
`(student, week_start)` é o que torna o job de sexta seguro para rodar de
novo.
