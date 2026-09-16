import unittest
import sys
import os

# Add repository root to sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from services.sanitize import scrub_pii, MAGIC_NUMBERS
from services.pre_sign import ALLOWED_MIME_TYPES

class TestLambdaServices(unittest.TestCase):
    def test_allowed_mime_types(self):
        self.assertIn('image/jpeg', ALLOWED_MIME_TYPES)
        self.assertIn('image/png', ALLOWED_MIME_TYPES)
        self.assertIn('image/webp', ALLOWED_MIME_TYPES)
        self.assertNotIn('application/pdf', ALLOWED_MIME_TYPES)
        self.assertNotIn('application/x-sh', ALLOWED_MIME_TYPES)

    def test_magic_numbers(self):
        # JPEG header: FF D8 FF
        jpeg_header = b'\xFF\xD8\xFF\xE0\x00\x10JFIF'
        self.assertTrue(any(jpeg_header.startswith(sig) for sig in MAGIC_NUMBERS.keys()))

        # PNG header: 89 50 4E 47
        png_header = b'\x89\x50\x4E\x47\x0D\x0A\x1A\x0A'
        self.assertTrue(any(png_header.startswith(sig) for sig in MAGIC_NUMBERS.keys()))

        # Corrupt or malicious payload header
        malicious_header = b'#!/bin/bash\nrm -rf /'
        self.assertFalse(any(malicious_header.startswith(sig) for sig in MAGIC_NUMBERS.keys()))

    def test_pii_scrubbing(self):
        raw = "Dr. Farooq attended Patient Imran (CNIC: 35202-9876543-2, Phone: 0333-4567890). Prescribed Tab Panadol."
        sanitized = scrub_pii(raw)

        self.assertIn("[REDACTED_CNIC]", sanitized)
        self.assertIn("[REDACTED_PHONE]", sanitized)
        self.assertIn("[REDACTED_NAME]", sanitized)
        self.assertNotIn("35202-9876543-2", sanitized)
        self.assertNotIn("0333-4567890", sanitized)
        self.assertNotIn("Dr. Farooq", sanitized)
        self.assertTrue(sanitized.startswith("<donor_transcription>"))
        self.assertTrue(sanitized.endswith("</donor_transcription>"))

    def test_geo_location_edge_headers(self):
        from services.sanitize import resolve_geo_location
        # 1. CloudFront headers test
        cf_headers = {
            'cloudfront-viewer-country': 'PK',
            'cloudfront-viewer-city-name': 'Lahore',
            'x-forwarded-for': '182.180.100.5'
        }
        country, city, ip_hash = resolve_geo_location(cf_headers)
        self.assertEqual(country, 'PK')
        self.assertEqual(city, 'Lahore')
        self.assertNotEqual(ip_hash, 'ANONYMOUS')
        self.assertEqual(len(ip_hash), 16)

        # 2. Cloudflare headers test
        cf_flare_headers = {
            'cf-ipcountry': 'PK',
            'cf-ipcity': 'Islamabad',
            'x-forwarded-for': '119.160.10.2'
        }
        country2, city2, ip_hash2 = resolve_geo_location(cf_flare_headers)
        self.assertEqual(country2, 'PK')
        self.assertEqual(city2, 'Islamabad')

if __name__ == '__main__':
    unittest.main()
