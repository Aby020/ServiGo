from django.db import models


# Create your models here.
class Contact(models.Model):
    name = models.CharField(max_length=25, null=False)
    email = models.EmailField(null=False)
    phone = models.CharField(max_length=10, null=False)
    service = models.CharField(max_length=50, null=False)
    message = models.TextField(null=False)
    date_time = models.DateTimeField(auto_now_add=True)

    def __str__(self) -> str:
        return self.name
