"""
Uniform error shape for the whole API.

Every error response is::

    {"error": {"code": "...", "message": "...", "details": {...}}}

`message` is user-facing Portuguese and safe to render straight into a toast.
`code` is what the frontend branches on.
"""

from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler


class APIError(Exception):
    """Raised by services; translated into the uniform error envelope."""

    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'ERROR'
    default_message = 'Não foi possível concluir a operação.'

    def __init__(self, message=None, code=None, details=None, status_code=None):
        self.message = message or self.default_message
        self.code = code or self.default_code
        self.details = details or {}
        if status_code is not None:
            self.status_code = status_code
        super().__init__(self.message)


class EntryAlreadyOpen(APIError):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'ENTRY_ALREADY_OPEN'
    default_message = 'Você já tem um ponto aberto.'


class NoOpenEntry(APIError):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'NO_OPEN_ENTRY'
    default_message = 'Você não tem nenhum ponto aberto.'


class StudentNotActive(APIError):
    status_code = status.HTTP_403_FORBIDDEN
    default_code = 'STUDENT_NOT_ACTIVE'
    default_message = 'Seu estágio não está ativo, então não é possível bater ponto.'


class SupervisionAlreadyExists(APIError):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'SUPERVISION_ALREADY_EXISTS'
    default_message = 'Esse professor já está vinculado a esse aluno.'


class StudentAlreadyHasAdvisor(APIError):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'STUDENT_ALREADY_HAS_ADVISOR'
    default_message = 'Esse aluno já tem um orientador principal.'


class InternshipHasStudents(APIError):
    status_code = status.HTTP_409_CONFLICT
    default_code = 'INTERNSHIP_HAS_STUDENTS'
    default_message = (
        'Esse estágio ainda tem alunos vinculados. Mova os alunos ou desative o estágio.'
    )


# DRF exception class name -> (code, message)
_DRF_CODES = {
    'NotAuthenticated': ('NOT_AUTHENTICATED', 'Faça login para continuar.'),
    'AuthenticationFailed': ('INVALID_CREDENTIALS', 'E-mail ou senha incorretos.'),
    'InvalidToken': ('TOKEN_EXPIRED', 'Sua sessão expirou. Entre novamente.'),
    'TokenError': ('TOKEN_EXPIRED', 'Sua sessão expirou. Entre novamente.'),
    'PermissionDenied': ('PERMISSION_DENIED', 'Você não tem permissão para isso.'),
    'NotFound': ('NOT_FOUND', 'Registro não encontrado.'),
    'MethodNotAllowed': ('METHOD_NOT_ALLOWED', 'Método não permitido.'),
    'Throttled': ('THROTTLED', 'Muitas tentativas. Espere um pouco e tente de novo.'),
    'ParseError': ('VALIDATION_ERROR', 'Requisição malformada.'),
}


def geicis_exception_handler(exc, context):
    if isinstance(exc, APIError):
        return Response(
            {'error': {'code': exc.code, 'message': exc.message, 'details': exc.details}},
            status=exc.status_code,
        )

    response = exception_handler(exc, context)
    if response is None:
        return None

    name = exc.__class__.__name__
    code, message = _DRF_CODES.get(name, ('VALIDATION_ERROR', 'Verifique os dados enviados.'))

    details = {}
    if isinstance(response.data, dict) and name not in _DRF_CODES:
        details = response.data
        # Surface the first field error as the toast message so the user sees
        # something specific instead of a generic sentence.
        first = next(iter(response.data.values()), None)
        if isinstance(first, list) and first:
            message = str(first[0])
        elif isinstance(first, str):
            message = first
    elif isinstance(response.data, dict) and 'detail' in response.data:
        details = {}

    response.data = {'error': {'code': code, 'message': message, 'details': details}}
    return response
