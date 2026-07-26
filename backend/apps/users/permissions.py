from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsCoordinator(BasePermission):
    message = 'Apenas a coordenação pode fazer isso.'

    def has_permission(self, request, view):
        return bool(request.user and request.user.is_authenticated and request.user.is_coordinator)


class IsStudent(BasePermission):
    message = 'Apenas alunos podem bater ponto.'

    def has_permission(self, request, view):
        user = request.user
        return bool(
            user
            and user.is_authenticated
            and user.is_student
            and hasattr(user, 'student_profile')
        )


class IsCoordinatorOrReadOnly(BasePermission):
    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return bool(request.user and request.user.is_authenticated)
        return bool(request.user and request.user.is_authenticated and request.user.is_coordinator)


def can_view_student(user, student):
    if user.is_coordinator:
        return True
    if user.is_professor and hasattr(user, 'professor_profile'):
        return user.professor_profile.supervises(student)
    if user.is_student and hasattr(user, 'student_profile'):
        return user.student_profile.pk == student.pk
    return False


def can_adjust_entry(user, entry):
    """Only a supervisor or the coordination may touch timestamps.

    A student may never edit check_in/check_out — on their own entries or
    anyone else's.
    """
    if user.is_coordinator:
        return True
    if user.is_professor and hasattr(user, 'professor_profile'):
        return user.professor_profile.supervises(entry.student)
    return False
