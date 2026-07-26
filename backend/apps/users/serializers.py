from django.contrib.auth.password_validation import validate_password
from django.db import transaction
from rest_framework import serializers

from apps.internships.models import Internship
from apps.users.models import ProfessorProfile, StudentProfile, Supervision, User


class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'email', 'full_name', 'role', 'is_active', 'date_joined']
        read_only_fields = fields


class InternshipBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Internship
        fields = ['id', 'title', 'organization']


class StudentProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    internship = InternshipBriefSerializer(read_only=True)
    internship_id = serializers.PrimaryKeyRelatedField(
        queryset=Internship.objects.all(),
        source='internship',
        write_only=True,
        required=False,
        allow_null=True,
    )
    total_hours = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    remaining_hours = serializers.DecimalField(max_digits=8, decimal_places=2, read_only=True)
    completion_percentage = serializers.DecimalField(
        max_digits=6, decimal_places=2, read_only=True
    )
    current_week_hours = serializers.DecimalField(
        max_digits=8, decimal_places=2, read_only=True
    )

    class Meta:
        model = StudentProfile
        fields = [
            'id',
            'user',
            'registration_number',
            'internship',
            'internship_id',
            'required_hours',
            'weekly_minimum_hours',
            'total_hours',
            'remaining_hours',
            'completion_percentage',
            'current_week_hours',
            'status',
            'started_at',
            'expected_end_at',
        ]
        read_only_fields = ['id', 'user', 'registration_number']

    def validate(self, attrs):
        required = attrs.get('required_hours', getattr(self.instance, 'required_hours', None))
        weekly = attrs.get(
            'weekly_minimum_hours', getattr(self.instance, 'weekly_minimum_hours', None)
        )
        if required is not None and weekly is not None and weekly > required:
            raise serializers.ValidationError(
                {'weekly_minimum_hours': 'O mínimo semanal não pode ser maior que a carga total.'}
            )
        return attrs


class ProfessorProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    student_count = serializers.SerializerMethodField()

    class Meta:
        model = ProfessorProfile
        fields = ['id', 'user', 'siape', 'department', 'student_count']

    def get_student_count(self, obj):
        return obj.supervisions.count()


class RegisterSerializer(serializers.Serializer):
    """Public student self-registration.

    `role` is deliberately not accepted here — there is no public path to a
    privileged account. Coordinators create professors through POST /users/.
    """

    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    password_confirm = serializers.CharField(write_only=True)
    registration_number = serializers.CharField(max_length=32)
    internship_id = serializers.PrimaryKeyRelatedField(
        queryset=Internship.objects.filter(is_active=True), required=False, allow_null=True
    )
    required_hours = serializers.IntegerField(min_value=1)
    weekly_minimum_hours = serializers.IntegerField(min_value=1)
    started_at = serializers.DateField()
    expected_end_at = serializers.DateField(required=False, allow_null=True)

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Já existe uma conta com esse e-mail.')
        return value

    def validate_registration_number(self, value):
        value = value.strip()
        if StudentProfile.objects.filter(registration_number=value).exists():
            raise serializers.ValidationError('Já existe um aluno com essa matrícula.')
        return value

    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({'password_confirm': 'As senhas não conferem.'})
        if attrs['weekly_minimum_hours'] > attrs['required_hours']:
            raise serializers.ValidationError(
                {'weekly_minimum_hours': 'O mínimo semanal não pode ser maior que a carga total.'}
            )
        end = attrs.get('expected_end_at')
        if end and end < attrs['started_at']:
            raise serializers.ValidationError(
                {'expected_end_at': 'O término não pode ser antes do início.'}
            )
        validate_password(attrs['password'])
        return attrs

    @transaction.atomic
    def create(self, validated_data):
        validated_data.pop('password_confirm')
        user = User.objects.create_user(
            email=validated_data.pop('email'),
            password=validated_data.pop('password'),
            full_name=validated_data.pop('full_name'),
            role=User.Role.STUDENT,
        )
        profile = StudentProfile.objects.create(
            user=user,
            internship=validated_data.pop('internship_id', None),
            **validated_data,
        )
        return profile


class StaffCreateSerializer(serializers.Serializer):
    """Coordinator-only creation of professors and other coordinators."""

    email = serializers.EmailField()
    full_name = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    role = serializers.ChoiceField(choices=[User.Role.PROFESSOR, User.Role.COORDINATOR])
    siape = serializers.CharField(max_length=32, required=False, allow_blank=True)
    department = serializers.CharField(max_length=120, required=False, allow_blank=True)

    def validate_email(self, value):
        value = value.lower().strip()
        if User.objects.filter(email__iexact=value).exists():
            raise serializers.ValidationError('Já existe uma conta com esse e-mail.')
        return value

    def validate_password(self, value):
        validate_password(value)
        return value

    @transaction.atomic
    def create(self, validated_data):
        role = validated_data['role']
        user = User.objects.create_user(
            email=validated_data['email'],
            password=validated_data['password'],
            full_name=validated_data['full_name'],
            role=role,
            is_staff=(role == User.Role.COORDINATOR),
        )
        if role == User.Role.PROFESSOR:
            ProfessorProfile.objects.create(
                user=user,
                siape=validated_data.get('siape') or None,
                department=validated_data.get('department', ''),
            )
        return user


class SupervisionSerializer(serializers.ModelSerializer):
    professor = ProfessorProfileSerializer(read_only=True)
    student = StudentProfileSerializer(read_only=True)
    professor_id = serializers.PrimaryKeyRelatedField(
        queryset=ProfessorProfile.objects.all(), source='professor', write_only=True
    )
    student_id = serializers.PrimaryKeyRelatedField(
        queryset=StudentProfile.objects.all(), source='student', write_only=True
    )

    class Meta:
        model = Supervision
        fields = ['id', 'professor', 'student', 'professor_id', 'student_id', 'role', 'created_at']
        read_only_fields = ['id', 'created_at']
        # DRF would auto-generate a UniqueTogetherValidator from the model's
        # unique(professor, student) constraint and answer 400. The contract
        # says 409 with a specific code, so the view raises it instead.
        validators = []
