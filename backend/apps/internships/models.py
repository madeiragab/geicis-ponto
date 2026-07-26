from django.db import models


class Internship(models.Model):
    """A placement: the host organization or project where students intern.

    One internship hosts many students; a student holds exactly one. The foreign
    key therefore lives on StudentProfile, which makes "one internship per
    student" a property of the schema rather than a rule someone has to
    remember to validate.
    """

    title = models.CharField('título', max_length=150)
    organization = models.CharField('instituição', max_length=150)
    description = models.TextField('descrição', blank=True)
    supervisor_name = models.CharField('supervisor', max_length=150, blank=True)
    supervisor_email = models.EmailField('e-mail do supervisor', blank=True)
    is_active = models.BooleanField('ativo', default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'estágio'
        verbose_name_plural = 'estágios'
        ordering = ['organization', 'title']
        constraints = [
            models.UniqueConstraint(
                fields=['title', 'organization'], name='internship_unique_title_org'
            ),
        ]

    def __str__(self):
        return f'{self.title} — {self.organization}'

    @property
    def student_count(self):
        return self.students.count()
