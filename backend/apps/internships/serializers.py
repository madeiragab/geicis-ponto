from rest_framework import serializers

from apps.internships.models import Internship


class InternshipSerializer(serializers.ModelSerializer):
    student_count = serializers.SerializerMethodField()

    def get_student_count(self, obj):
        # Uses the annotation on list/retrieve; falls back to a query on create,
        # where the fresh instance carries no annotation.
        annotated = getattr(obj, 'student_count_annotated', None)
        return obj.students.count() if annotated is None else annotated

    class Meta:
        model = Internship
        fields = [
            'id',
            'title',
            'organization',
            'description',
            'supervisor_name',
            'supervisor_email',
            'is_active',
            'student_count',
            'created_at',
        ]
        read_only_fields = ['id', 'student_count', 'created_at']

    def validate(self, attrs):
        title = attrs.get('title', getattr(self.instance, 'title', None))
        org = attrs.get('organization', getattr(self.instance, 'organization', None))
        qs = Internship.objects.filter(title=title, organization=org)
        if self.instance:
            qs = qs.exclude(pk=self.instance.pk)
        if qs.exists():
            raise serializers.ValidationError(
                {'title': 'Já existe um estágio com esse título nessa instituição.'}
            )
        return attrs


class InternshipMinimalSerializer(serializers.ModelSerializer):
    """For the registration form's select, which needs the full list."""

    class Meta:
        model = Internship
        fields = ['id', 'title', 'organization']
