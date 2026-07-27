# Modelo de Dados

🇧🇷 **Português** | 🇺🇸 [English](../data-model.md)

Cada entidade, campo e constraint. O equivalente visual é
[diagrams/er-diagram.md](diagrams/er-diagram.md).

## Resumo das cardinalidades

| Relação                  | Cardinalidade | Implementado como                           |
| ------------------------- | ------------- | -------------------------------------------- |
| Professor ↔ Aluno         | N:M           | Tabela de junção `Supervision`               |
| Estágio → Aluno           | 1:N           | FK `StudentProfile.internship`               |
| Aluno → TimeEntry         | 1:N           | FK `TimeEntry.student`                       |
| Aluno → WeeklyAlert       | 1:N           | FK `WeeklyAlert.student`                     |
| User → StudentProfile     | 1:1           | OneToOne `StudentProfile.user`               |
| User → ProfessorProfile   | 1:1           | OneToOne `ProfessorProfile.user`             |

A relação de estágio se lê: **um estágio hospeda vários alunos, um aluno tem
exatamente um estágio.** A chave estrangeira, portanto, vive no aluno, não no
estágio.

---

## User

O registro de autenticação. Uma linha por pessoa, seja qual for seu papel.
Estende `AbstractBaseUser` + `PermissionsMixin`, e é definido como `AUTH_USER_MODEL`.

| Campo           | Tipo              | Regras                                          |
| --------------- | ----------------- | ------------------------------------------------ |
| `id`            | BigAutoField      | PK                                              |
| `email`         | EmailField        | **único**, `USERNAME_FIELD` — identificador de login |
| `full_name`     | CharField(150)    | obrigatório                                      |
| `role`          | CharField(16)     | `STUDENT` \| `PROFESSOR` \| `COORDINATOR`       |
| `password`      | CharField(128)    | hash PBKDF2, nunca retornado pela API            |
| `is_active`     | BooleanField      | padrão `True`; bloqueia login quando `False`     |
| `is_staff`      | BooleanField      | `True` só para `COORDINATOR`                    |
| `date_joined`   | DateTimeField     | automático                                       |
| `last_login`    | DateTimeField     | automático, definido pelo SimpleJWT              |

O login é por e-mail, não por username — os alunos já se identificam assim e
os e-mails de alerta vão pro mesmo endereço, então não existe um segundo campo
de contato pra manter sincronizado.

---

## StudentProfile

O lado aluno de um `User`. Criado junto com o usuário durante o cadastro.

| Campo                   | Tipo                | Regras                                                        |
| ------------------------ | ------------------- | --------------------------------------------------------------- |
| `id`                    | BigAutoField        | PK                                                              |
| `user`                  | OneToOne(User)      | `on_delete=CASCADE`, `related_name='student_profile'`            |
| `registration_number`   | CharField(32)       | **único** — matrícula                                            |
| `internship`            | FK(Internship)      | `on_delete=PROTECT`, nulo até ser atribuído                     |
| `required_hours`        | PositiveIntegerField| horas totais exigidas pelo estágio; perguntado no cadastro       |
| `weekly_minimum_hours`  | PositiveIntegerField| horas esperadas por semana; dispara o alerta de sexta            |
| `started_at`            | DateField           | primeiro dia do estágio                                          |
| `expected_end_at`       | DateField           | nulo; prazo para `required_hours`                                |
| `status`                | CharField(16)       | `ACTIVE` \| `COMPLETED` \| `SUSPENDED` \| `WITHDRAWN`           |
| `created_at`            | DateTimeField       | automático                                                      |
| `updated_at`            | DateTimeField       | automático                                                      |

**Constraints**

- `required_hours > 0`
- `weekly_minimum_hours > 0`
- `weekly_minimum_hours <= required_hours`
- `expected_end_at IS NULL OR expected_end_at >= started_at`

`internship` usa `PROTECT` deliberadamente: apagar um estágio que ainda tem
alunos vinculados deixaria registros de horas órfãos. O coordenador precisa
mover os alunos antes, ou desativar o estágio em vez de apagá-lo.

**Valores derivados** (calculados, nunca guardados — veja
[business-rules.md](business-rules.md#cálculo-de-horas)):
`total_hours`, `remaining_hours`, `completion_percentage`, `current_week_hours`.

---

## ProfessorProfile

| Campo         | Tipo            | Regras                                            |
| ------------- | --------------- | --------------------------------------------------- |
| `id`          | BigAutoField    | PK                                                  |
| `user`        | OneToOne(User)  | `on_delete=CASCADE`, `related_name='professor_profile'` |
| `siape`       | CharField(32)   | **único**, nulo — registro institucional             |
| `department`  | CharField(120)  | opcional                                             |
| `created_at`  | DateTimeField   | automático                                           |

---

## Internship

Um estágio: a organização ou projeto hospedeiro onde os alunos estagiam.
Compartilhado por vários alunos.

| Campo              | Tipo            | Regras                                    |
| -------------------- | --------------- | -------------------------------------------- |
| `id`               | BigAutoField    | PK                                        |
| `title`            | CharField(150)  | obrigatório — ex. "Infraestrutura — TRE-PE" |
| `organization`     | CharField(150)  | obrigatório — instituição hospedeira        |
| `description`      | TextField       | opcional                                    |
| `supervisor_name`  | CharField(150)  | opcional — contato na organização           |
| `supervisor_email` | EmailField      | opcional                                    |
| `is_active`        | BooleanField    | padrão `True`                               |
| `created_at`       | DateTimeField   | automático                                  |
| `updated_at`       | DateTimeField   | automático                                  |

**Constraints**

- `unique(title, organization)` — sem dois estágios idênticos

---

## Supervision

O vínculo muitos-para-muitos entre professores e alunos. Um model separado em
vez de um simples `ManyToManyField`, porque a relação carrega dados próprios e
vai crescer.

| Campo         | Tipo                    | Regras                                  |
| ------------- | ----------------------- | -------------------------------------------- |
| `id`          | BigAutoField            | PK                                          |
| `professor`   | FK(ProfessorProfile)    | `on_delete=CASCADE`, `related_name='supervisions'` |
| `student`     | FK(StudentProfile)      | `on_delete=CASCADE`, `related_name='supervisions'` |
| `role`        | CharField(16)           | `ADVISOR` \| `CO_ADVISOR`, padrão `ADVISOR` |
| `created_at`  | DateTimeField           | automático                                  |

**Constraints**

- `unique(professor, student)` — o mesmo par não pode ser vinculado duas vezes
- No máximo um `ADVISOR` por aluno — reforçado no serializer, já que um índice
  único parcial em `(student)` onde `role='ADVISOR'` é a metade no banco

---

## TimeEntry

Um par de entrada/saída de ponto. O coração do sistema.

| Campo         | Tipo                | Regras                                                 |
| ------------- | ------------------- | ----------------------------------------------------------- |
| `id`          | BigAutoField        | PK                                                          |
| `student`     | FK(StudentProfile)  | `on_delete=CASCADE`, `related_name='time_entries'`           |
| `check_in`    | DateTimeField       | obrigatório, definido na entrada                             |
| `check_out`   | DateTimeField       | **anulável** — nulo significa que o registro está aberto     |
| `notes`       | CharField(255)      | opcional, o que foi trabalhado                                |
| `adjusted_by` | FK(User)            | nulo, `on_delete=SET_NULL` — quem corrigiu                    |
| `adjustment_reason` | CharField(255) | obrigatório quando `adjusted_by` está definido               |
| `created_at`  | DateTimeField       | automático                                                   |
| `updated_at`  | DateTimeField       | automático                                                   |

**Constraints**

- `check_out IS NULL OR check_out > check_in`
- **No máximo um registro aberto por aluno** — índice único parcial em `student`
  onde `check_out IS NULL`. Isso é uma constraint de banco, não só uma checagem
  de serializer: um clique duplo no botão de entrada não pode criar dois
  registros abertos.
- `check_in <= now()` — não dá pra bater ponto no futuro

**Índice**: `(student, check_in)` — toda query de ranking, resumo e semanal
filtra exatamente por esse par.

A duração **não** é uma coluna guardada. É `check_out - check_in`, calculada na
query. Guardá-la criaria uma segunda fonte de verdade que uma correção poderia
deixar desatualizada.

---

## WeeklyAlert

O histórico dos avisos de sexta. Sua constraint única é o que torna o job
semanal seguro de rodar de novo.

| Campo              | Tipo                | Regras                                    |
| -------------------- | ------------------- | ---------------------------------------------- |
| `id`               | BigAutoField        | PK                                            |
| `student`          | FK(StudentProfile)  | `on_delete=CASCADE`, `related_name='weekly_alerts'` |
| `week_start`       | DateField           | a segunda-feira da semana avaliada             |
| `hours_logged`     | DecimalField(6,2)   | horas que o aluno tinha naquela semana         |
| `minimum_required` | DecimalField(6,2)   | a meta no momento da avaliação                  |
| `sent_at`          | DateTimeField       | quando o e-mail de fato saiu                    |
| `delivery_status`  | CharField(16)       | `SENT` \| `FAILED`                             |
| `error_message`    | CharField(255)      | preenchido quando `FAILED`                      |

**Constraints**

- `unique(student, week_start)` — um alerta por aluno por semana, pra sempre

`minimum_required` é copiado em vez de lido de volta do perfil, porque o
coordenador pode mudar o mínimo semanal de um aluno depois, e o registro
histórico deve continuar dizendo o que foi de fato exigido naquela semana.

---

## Comportamento de exclusão, de relance

| Apagando…    | Efeito                                                              |
| ------------- | --------------------------------------------------------------------- |
| `User`       | propaga pro perfil, e dele pros registros e alertas                   |
| `Internship` | **bloqueado** enquanto qualquer aluno o referencia (`PROTECT`)         |
| `Professor`  | propaga só pras linhas de `Supervision`; alunos não são afetados      |
| `TimeEntry`  | exclusão definitiva, só coordenador, registrado no log do admin do Django |
