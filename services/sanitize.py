import json
import os
import io
import re
import hashlib
from datetime import datetime, timezone
import boto3
from PIL import Image, ImageOps

MAGIC_NUMBERS = {
    b'\xFF\xD8\xFF': 'jpeg',
    b'\x89\x50\x4E\x47': 'png',
    b'RIFF': 'webp'
}

def get_s3_client():
    return boto3.client('s3')

def get_dynamo_table():
    dynamodb = boto3.resource('dynamodb')
    table_name = os.environ.get('TABLE_NAME', 'sehatkosh-donations')
    return dynamodb.Table(table_name)

def scrub_pii(raw_text: str) -> str:
    """
    Scrubs Pakistani CNIC, mobile numbers, and common clinician/patient names.
    Wraps sanitized text in <donor_transcription> delimiters.
    """
    if not raw_text:
        return ""

    # Scrub Pakistani CNIC (13 digits: XXXXX-XXXXXXX-X or without dashes)
    text = re.sub(r'\b\d{5}[-]?\d{7}[-]?\d{1}\b', '[REDACTED_CNIC]', raw_text)

    # Scrub Pakistani Mobile Numbers (03xx-xxxxxxx / +923xxxxxxxxx)
    text = re.sub(r'(\+92|0)?3\d{2}[-\s]?\d{7}\b', '[REDACTED_PHONE]', text)

    # Scrub Common Direct Clinician & Patient Identifiers
    text = re.sub(r'(?i)\b(dr|doctor|patient|mr|mrs|ms)\.?\s+[a-zA-Z]+', '[REDACTED_NAME]', text)

    # Encapsulate in custom delimiters for downstream LLM training pipeline protection
    sanitized_body = text.strip()
    return f"<donor_transcription>\n{sanitized_body}\n</donor_transcription>"

def handler(event, context):
    cors_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }

    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': ''
        }

    try:
        headers = event.get('headers', {})
        # Normalize header keys to lowercase
        norm_headers = {k.lower(): v for k, v in headers.items()}

        body_raw = event.get('body', '{}')
        if isinstance(body_raw, str):
            body = json.loads(body_raw) if body_raw else {}
        else:
            body = body_raw or {}

        donation_id = body.get('donation_id')
        transcription_raw = body.get('transcription', '')

        if not donation_id:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'donation_id is required'})
            }

        if len(transcription_raw) > 4000:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Transcription exceeds maximum limit of 4000 characters'})
            }

        # Extract CloudFront Geo and edge metadata
        country = norm_headers.get('cloudfront-viewer-country', 'UNKNOWN')
        city = norm_headers.get('cloudfront-viewer-city-name', 'UNKNOWN')
        raw_ip = norm_headers.get('x-forwarded-for', '').split(',')[0].strip()
        ip_hash = hashlib.sha256(raw_ip.encode()).hexdigest()[:16] if raw_ip else 'ANONYMOUS'

        bucket_name = os.environ.get('BUCKET_NAME', 'sehatkosh-donor-storage')
        raw_key = f"raw-intake/{donation_id}.tmp"

        now = datetime.now(timezone.utc)
        sanitized_key = f"sanitized-archive/{now.year}/{now.strftime('%m')}/{donation_id}.webp"

        s3 = get_s3_client()
        table = get_dynamo_table()

        # 1. Fetch raw binary from S3
        try:
            obj = s3.get_object(Bucket=bucket_name, Key=raw_key)
            raw_bytes = obj['Body'].read()
        except Exception as s3_err:
            return {
                'statusCode': 404,
                'headers': cors_headers,
                'body': json.dumps({'error': f"Raw object not found in intake buffer: {str(s3_err)}"})
            }

        # 2. Verify magic bytes
        is_valid = any(raw_bytes.startswith(sig) for sig in MAGIC_NUMBERS.keys())
        if not is_valid:
            table.update_item(
                Key={'PK': f"DONATION#{donation_id}"},
                UpdateExpression="SET #s = :status",
                ExpressionAttributeNames={'#s': 'status'},
                ExpressionAttributeValues={':status': 'QUARANTINED'}
            )
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Malicious or unsupported payload detected. File quarantined.'})
            }

        # 3. Strip EXIF and re-encode to standardized WebP
        image = Image.open(io.BytesIO(raw_bytes))
        image = ImageOps.exif_transpose(image)  # Maintain user rotation
        if image.mode in ('RGBA', 'LA') or (image.mode == 'P' and 'transparency' in image.info):
            image = image.convert('RGBA')
        else:
            image = image.convert('RGB')

        dimensions = f"{image.width}x{image.height}"
        output_buffer = io.BytesIO()
        image.save(output_buffer, format='WEBP', quality=85, method=6)
        output_bytes = output_buffer.getvalue()

        # 4. Save sanitized asset
        s3.put_object(
            Bucket=bucket_name,
            Key=sanitized_key,
            Body=output_bytes,
            ContentType='image/webp'
        )

        # 5. Delete raw buffer object
        s3.delete_object(Bucket=bucket_name, Key=raw_key)

        # 6. Scrub text and commit record
        scrubbed_text = scrub_pii(transcription_raw)

        table.update_item(
            Key={'PK': f"DONATION#{donation_id}"},
            UpdateExpression="""
                SET #s = :status,
                    transcription = :txt,
                    char_count = :cc,
                    s3_sanitized_key = :skey,
                    geo_country = :c,
                    geo_city = :city,
                    ip_fingerprint = :ip,
                    image_dimensions = :dims,
                    file_size = :size,
                    verified_at = :ts
            """,
            ExpressionAttributeNames={'#s': 'status'},
            ExpressionAttributeValues={
                ':status': 'VERIFIED',
                ':txt': scrubbed_text,
                ':cc': len(transcription_raw),
                ':skey': sanitized_key,
                ':c': country,
                ':city': city,
                ':ip': ip_hash,
                ':dims': dimensions,
                ':size': len(output_bytes),
                ':ts': int(now.timestamp())
            }
        )

        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'status': 'SUCCESS',
                'donation_id': donation_id,
                'sanitized_key': sanitized_key
            })
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }
