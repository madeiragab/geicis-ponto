from django.db import IntegrityError
from django.db.models import Q
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.generics import GenericAPIView
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework_simplejwt.serializers import TokenObtainPairSerializer
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from config.exceptions import (
    APIError,
    StudentAlreadyHasAdvisor,
    SupervisionAlreadyExists,
)
from apps.users.models import ProfessorProfile, StudentProfile, Supervision, User
from apps.users.permissions import IsCoordinator, can_view_student
from apps.users.serializers import (
    AvatarUploadSerializer,
    ChangePasswordSerializer,
    ProfessorProfileSerializer,
    RegisterSerializer,
    StaffCreateSerializer,
    StudentProfileSerializer,
    SupervisionSerializer,
    UserSerializer,
)


class GeicisTokenObtainPairSerializer(TokenObtainPairSerializer):
    """Adds the role to the token payload and the user object to the response."""

    @classmethod
    def get_token(cls, user):
        token = super().get_token(user)
        token['role'] = user.role
        token['full_name'] = user.full_name
        return token

    def validate(self, attrs):
        data = super().validate(attrs)
        data['user'] = UserSerializer(self.user, context=self.context).data
        return data


class GeicisTokenObtainPairView(TokenObtainPairView):
    serializer_class = GeicisTokenObtainPairSerializer
    permission_classes = [AllowAny]
    throttle_scope = 'login'


class GeicisTokenRefreshView(TokenRefreshView):
    permission_classes = [AllowAny]


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        refresh = request.data.get('refresh')
        if not refresh:
            raise APIError('Informe o token de refresh.', code='VALIDATION_ERROR')
        try:
            RefreshToken(refresh).blacklist()
        except Exception:
            # An already-blacklisted or malformed token still ends the session
            # from the client's point of view; nothing useful to report back.
            pass
        return Response(status=status.HTTP_204_NO_CONTENT)


class RegisterView(GenericAPIView):
    serializer_class = RegisterSerializer
    permission_classes = [AllowAny]
    throttle_scope = 'register'

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        profile = serializer.save()
        return Response(
            StudentProfileSerializer(profile, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class MeView(APIView):
    def get(self, request):
        user = request.user
        ctx = {'request': request}
        data = UserSerializer(user, context=ctx).data
        if user.is_student and hasattr(user, 'student_profile'):
            data['student_profile'] = StudentProfileSerializer(
                user.student_profile, context=ctx
            ).data
        elif user.is_professor and hasattr(user, 'professor_profile'):
            data['professor_profile'] = ProfessorProfileSerializer(
                user.professor_profile, context=ctx
            ).data
        return Response(data)


class StaffCreateView(GenericAPIView):
    serializer_class = StaffCreateSerializer
    permission_classes = [IsCoordinator]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user = serializer.save()
        return Response(
            UserSerializer(user, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class ChangePasswordView(GenericAPIView):
    serializer_class = ChangePasswordSerializer
    permission_classes = [IsAuthenticated]

    def post(self, request):
        serializer = self.get_serializer(
            data=request.data, context={'user': request.user}
        )
        serializer.is_valid(raise_exception=True)
        request.user.set_password(serializer.validated_data['new_password'])
        request.user.save(update_fields=['password'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class AvatarUploadView(GenericAPIView):
    serializer_class = AvatarUploadSerializer
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        old = request.user.avatar
        request.user.avatar = serializer.validated_data['avatar']
        request.user.save(update_fields=['avatar'])
        if old:
            old.delete(save=False)

        return Response(UserSerializer(request.user, context={'request': request}).data)

    def delete(self, request):
        if request.user.avatar:
            request.user.avatar.delete(save=True)
        return Response(UserSerializer(request.user, context={'request': request}).data)


class StudentViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = StudentProfileSerializer
    # Fields only the coordination may change — a student cannot lower their
    # own target.
    COORDINATOR_ONLY_FIELDS = {
        'required_hours',
        'weekly_minimum_hours',
        'internship_id',
        'status',
    }

    def get_queryset(self):
        qs = (
            StudentProfile.objects.select_related('user', 'internship')
            .with_total_hours()
            .all()
        )
        # Same filter pair the internship list exposes, so the coordination
        # screen can find one student without paging through everyone.
        search = self.request.query_params.get('search')
        if search:
            qs = qs.filter(
                Q(user__full_name__icontains=search)
                | Q(user__email__icontains=search)
                | Q(registration_number__icontains=search)
            )
        internship = self.request.query_params.get('internship')
        if internship:
            qs = qs.filter(internship_id=internship)
        return qs

    def update(self, request, *args, **kwargs):
        # Authorization runs before validation on purpose. Checking it in
        # perform_update would let a student PATCHing required_hours get a 400
        # from the serializer's own consistency rules instead of the 403 that
        # actually describes why the request was refused.
        self._assert_may_edit(request)
        return super().update(request, *args, **kwargs)

    def _assert_may_edit(self, request):
        user = request.user
        if user.is_coordinator:
            return

        touched = self.COORDINATOR_ONLY_FIELDS & set(request.data.keys())
        if touched:
            raise APIError(
                'Só a coordenação pode alterar a meta de horas, o estágio ou o status.',
                code='PERMISSION_DENIED',
                status_code=status.HTTP_403_FORBIDDEN,
                details={'fields': sorted(touched)},
            )

        student = self.get_object()
        if not (
            user.is_student
            and hasattr(user, 'student_profile')
            and user.student_profile.pk == student.pk
        ):
            raise APIError(
                'Você não tem permissão para editar esse aluno.',
                code='PERMISSION_DENIED',
                status_code=status.HTTP_403_FORBIDDEN,
            )

    @action(detail=True, methods=['get'])
    def summary(self, request, pk=None):
        from apps.timesheet.services import build_student_summary

        student = self.get_object()
        if not can_view_student(request.user, student):
            # 404 rather than 403: the API does not confirm a record exists to
            # someone who is not allowed to see it.
            raise APIError(
                'Registro não encontrado.',
                code='NOT_FOUND',
                status_code=status.HTTP_404_NOT_FOUND,
            )
        return Response(build_student_summary(student))

    @action(detail=True, methods=['get'])
    def professors(self, request, pk=None):
        student = self.get_object()
        professors = ProfessorProfile.objects.filter(supervisions__student=student).distinct()
        return Response(
            ProfessorProfileSerializer(professors, many=True, context={'request': request}).data
        )


class ProfessorViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    serializer_class = ProfessorProfileSerializer
    queryset = ProfessorProfile.objects.select_related('user').all()

    @action(detail=True, methods=['get'])
    def students(self, request, pk=None):
        professor = self.get_object()
        students = (
            StudentProfile.objects.select_related('user', 'internship')
            .filter(supervisions__professor=professor)
            .with_total_hours()
            .distinct()
        )
        return Response(
            StudentProfileSerializer(students, many=True, context={'request': request}).data
        )


class SupervisionViewSet(
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = SupervisionSerializer
    queryset = Supervision.objects.select_related(
        'professor__user', 'student__user', 'student__internship'
    ).all()

    def get_permissions(self):
        if self.action in {'create', 'destroy'}:
            return [IsCoordinator()]
        return super().get_permissions()

    def perform_create(self, serializer):
        student = serializer.validated_data['student']
        professor = serializer.validated_data['professor']
        role = serializer.validated_data.get('role', Supervision.Role.ADVISOR)

        if Supervision.objects.filter(professor=professor, student=student).exists():
            raise SupervisionAlreadyExists()
        if (
            role == Supervision.Role.ADVISOR
            and Supervision.objects.filter(
                student=student, role=Supervision.Role.ADVISOR
            ).exists()
        ):
            raise StudentAlreadyHasAdvisor()

        try:
            serializer.save()
        except IntegrityError:
            # The database constraints are the real guarantee; the checks above
            # exist only to produce a readable message.
            raise SupervisionAlreadyExists()
