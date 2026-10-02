"""
Tests for the upload guards on `User.profile_image`.

Two separate rules, tested separately because they fail for different reasons
and are enforced in different places:

  * the extension allow-list is a ``FileExtensionValidator`` on the model
    field, so it also covers the Django admin and any direct construction of a
    ``User`` — not just `UserProfileForm`;
  * the size cap is a model validator that the profile form invokes a second
    time from ``clean_profile_image``, so the error surfaces against the file
    input rather than in the form-wide error summary.
"""
import io

from django.core.exceptions import ValidationError
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.validators import FileExtensionValidator
from django.test import TestCase
from PIL import Image

from accounts.forms import UserProfileForm
from accounts.models import (
    MAX_PROFILE_IMAGE_BYTES,
    User,
    validate_profile_image_size,
)
from tests.accounts.factories import make_customer


def image_upload(name, image_format, total_bytes=None):
    """
    A genuinely decodable image named `name`, exactly `total_bytes` long.

    `ImageField` verifies uploads with Pillow, so a fixture of random bytes
    wearing an image extension is rejected for the wrong reason and the test
    ends up asserting nothing about the guards. Bytes after a PNG's IEND chunk
    are ignored by Pillow, which is what lets the file be inflated to any size
    the size-limit tests need — and `total_bytes` rather than "padding" so the
    caller cannot get the boundary arithmetic wrong.
    """
    buffer = io.BytesIO()
    Image.new("RGB", (8, 8), (10, 120, 200)).save(buffer, format=image_format)
    data = buffer.getvalue()
    if total_bytes is not None:
        if total_bytes < len(data):
            raise ValueError(
                f"{name}: {total_bytes} bytes is smaller than the {len(data)}-byte "
                f"{image_format} image itself."
            )
        data += b"\0" * (total_bytes - len(data))
    return SimpleUploadedFile(name, data)


class ProfileUploadTestCase(TestCase):
    """Shared fixture data — a valid profile form post, minus the image."""

    def form_data(self, **overrides):
        data = {
            "first_name": "Pat",
            "last_name": "Ng",
            "email": "p@example.com",
            "phone": "",
            "address": "",
            "city": "",
            "state": "",
            "pincode": "",
        }
        data.update(overrides)
        return data


class ProfileImageExtensionGuardTests(ProfileUploadTestCase):
    FORMATS = {"jpg": "JPEG", "jpeg": "JPEG", "png": "PNG", "webp": "WEBP"}

    def test_allowed_extensions(self):
        customer = make_customer(email="p@example.com")
        for index, (ext, image_format) in enumerate(self.FORMATS.items()):
            with self.subTest(ext=ext):
                form = UserProfileForm(
                    data=self.form_data(email=f"p{index}@example.com"),
                    files={"profile_image": image_upload(f"avatar.{ext}", image_format)},
                    instance=customer,
                )
                self.assertTrue(form.is_valid(), form.errors)

    def test_disallowed_extension_rejected(self):
        customer = make_customer(email="p@example.com")
        form = UserProfileForm(
            data=self.form_data(),
            files={"profile_image": SimpleUploadedFile("payload.svg", b"<svg/>")},
            instance=customer,
        )
        self.assertFalse(form.is_valid())
        self.assertIn("profile_image", form.errors)

    def test_field_declares_the_validator(self):
        """
        The guard lives on the model, not only on the form.

        If the validator were form-only, an operator uploading through the
        Django admin would bypass the allow-list entirely. Run the validator
        itself rather than `field.clean`, because `ImageField.clean` reduces an
        upload to its stored name before running validators — passing the raw
        path it hands them to `FileExtensionValidator`, which would raise
        AttributeError rather than the ValidationError under test.
        """
        field = User._meta.get_field("profile_image")
        validator = next(
            v for v in field.validators if isinstance(v, FileExtensionValidator)
        )
        with self.assertRaises(ValidationError):
            validator(SimpleUploadedFile("payload.svg", b"<svg></svg>"))
        for ext in ("jpg", "jpeg", "png", "webp"):
            validator(SimpleUploadedFile(f"avatar.{ext}", b"\xff\xd8\xff"))


class ProfileImageSizeGuardTests(ProfileUploadTestCase):
    def test_oversized_upload_rejected_on_the_field(self):
        customer = make_customer(email="p@example.com")
        form = UserProfileForm(
            data=self.form_data(),
            files={
                "profile_image": image_upload(
                    "avatar.png", "PNG", MAX_PROFILE_IMAGE_BYTES + 1
                )
            },
            instance=customer,
        )
        self.assertFalse(form.is_valid())
        self.assertIn("profile_image", form.errors)

    def test_file_exactly_at_the_limit_accepted(self):
        """`>` not `>=`: a file of exactly the cap is still a valid picture."""
        customer = make_customer(email="p@example.com")
        form = UserProfileForm(
            data=self.form_data(),
            files={
                "profile_image": image_upload(
                    "avatar.png", "PNG", MAX_PROFILE_IMAGE_BYTES
                )
            },
            instance=customer,
        )
        self.assertTrue(form.is_valid(), form.errors)

    def test_model_validator_rejects_directly(self):
        """`full_clean` — the admin's path — enforces the cap too."""
        customer = make_customer(email="p@example.com")
        customer.profile_image = image_upload(
            "avatar.png", "PNG", MAX_PROFILE_IMAGE_BYTES + 1
        )
        with self.assertRaises(ValidationError):
            customer.full_clean()

    def test_validator_ignores_values_without_a_size(self):
        # A profile image read back from storage is a path, not a file; the
        # guard must not blow up on something it cannot measure.
        self.assertIsNone(validate_profile_image_size("profiles/avatar.png"))