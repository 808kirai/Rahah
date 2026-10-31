"""profile photos, any picture from a student's gallery made into a small square jpeg

the picture is opened and drawn again here, so only plain pixels are kept: nothing hidden inside the file,
like where the photo was taken, reaches anyone else
"""

from io import BytesIO

from PIL import Image, ImageOps, UnidentifiedImageError

# a photo is shown small, so it's stored at this size
photo_size = 256
# a picture with more pixels than this is refused before it's decoded, so it can't use up the server's memory
Image.MAX_IMAGE_PIXELS = 40_000_000
kinds = ("JPEG", "PNG", "WEBP", "GIF", "MPO")
not_a_photo = "That doesn't look like a photo Rahah can use. Try a JPG or PNG from your gallery."


def square_photo(data: bytes) -> bytes:
    """the middle of the picture as a square jpeg, turned the right way up, with nothing else kept"""
    try:
        with Image.open(BytesIO(data)) as picture:
            if picture.format not in kinds:
                raise ValueError(not_a_photo)
            # phones save photos sideways with a note to turn them, so they're turned here before the note is dropped
            upright = ImageOps.exif_transpose(picture).convert("RGB")
            square = ImageOps.fit(upright, (photo_size, photo_size), Image.Resampling.LANCZOS)
            out = BytesIO()
            square.save(out, "JPEG", quality=85, optimize=True)
            return out.getvalue()
    except (UnidentifiedImageError, Image.DecompressionBombError, OSError, SyntaxError):
        raise ValueError(not_a_photo)
