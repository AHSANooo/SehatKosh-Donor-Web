import json
import os
import time
import ulid
import boto3
from botocore.config import Config

ALLOWED_MIME_TYPES = {'image/jpeg', 'image/png', 'image/webp'}

def get_s3_client():
    region = os.environ.get('AWS_REGION', 'ap-south-1')
    return boto3.client(
        's3',
        region_name=region,
        endpoint_url=f"https://s3.{region}.amazonaws.com",
        config=Config(signature_version='s3v4', s3={'addressing_style': 'virtual'})
    )

def get_dynamo_table():
    dynamodb = boto3.resource('dynamodb')
    table_name = os.environ.get('TABLE_NAME', 'sehatkosh-donations')
    return dynamodb.Table(table_name)

def handler(event, context):
    cors_headers = {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'OPTIONS,POST',
        'Access-Control-Allow-Headers': 'Content-Type,Authorization'
    }

    # Handle OPTIONS preflight
    if event.get('requestContext', {}).get('http', {}).get('method') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': ''
        }

    try:
        body_raw = event.get('body', '{}')
        if isinstance(body_raw, str):
            body = json.loads(body_raw) if body_raw else {}
        else:
            body = body_raw or {}

        mime_type = body.get('mime_type')
        if not mime_type or mime_type not in ALLOWED_MIME_TYPES:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'Invalid MIME type. Must be image/jpeg, image/png, or image/webp.'})
            }

        file_size = body.get('file_size', 0)
        if file_size and file_size > 10 * 1024 * 1024:
            return {
                'statusCode': 400,
                'headers': cors_headers,
                'body': json.dumps({'error': 'File exceeds maximum allowed size (10 MB).'})
            }

        donation_id = str(ulid.new())
        s3_key = f"raw-intake/{donation_id}.tmp"
        bucket_name = os.environ.get('BUCKET_NAME', 'sehatkosh-donor-storage')

        s3_client = get_s3_client()
        presigned_url = s3_client.generate_presigned_url(
            ClientMethod='put_object',
            Params={
                'Bucket': bucket_name,
                'Key': s3_key,
                'ContentType': mime_type
            },
            ExpiresIn=300
        )

        table = get_dynamo_table()
        table.put_item(
            Item={
                'PK': f"DONATION#{donation_id}",
                'donation_id': donation_id,
                'status': 'PENDING_UPLOAD',
                'created_at': int(time.time()),
                's3_raw_key': s3_key,
                'mime_type': mime_type,
            }
        )

        return {
            'statusCode': 200,
            'headers': cors_headers,
            'body': json.dumps({
                'donation_id': donation_id,
                'upload_url': presigned_url,
                's3_key': s3_key
            })
        }
    except Exception as e:
        return {
            'statusCode': 500,
            'headers': cors_headers,
            'body': json.dumps({'error': str(e)})
        }
