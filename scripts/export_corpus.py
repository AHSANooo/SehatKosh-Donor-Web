#!/usr/bin/env python3
"""
SehatKosh Research Corpus Exporter
Downloads verified prescription images from Amazon S3 and pairs them
with their sanitized clinical transcriptions and metadata from Amazon DynamoDB.
"""

import os
import csv
import json
import argparse
import boto3
from botocore.exceptions import ClientError

DEFAULT_REGION = 'ap-south-1'
DEFAULT_TABLE = 'sehatkosh-donations'
DEFAULT_BUCKET = 'sehatkosh-donor-storage-847333136820'
DEFAULT_OUTDIR = 'sehatkosh_corpus'

def parse_args():
    parser = argparse.ArgumentParser(description="Export SehatKosh multimodal donation dataset")
    parser.add_argument('--region', default=DEFAULT_REGION, help='AWS Region')
    parser.add_argument('--table', default=DEFAULT_TABLE, help='DynamoDB Table Name')
    parser.add_argument('--bucket', default=DEFAULT_BUCKET, help='S3 Bucket Name')
    parser.add_argument('--output-dir', default=DEFAULT_OUTDIR, help='Output directory for exported corpus')
    parser.add_argument('--all-statuses', action='store_true', help='Include all records, not just VERIFIED')
    return parser.parse_args()

def main():
    args = parse_args()

    # Create destination directories
    base_dir = os.path.abspath(args.output_dir)
    images_dir = os.path.join(base_dir, 'images')
    transcriptions_dir = os.path.join(base_dir, 'transcriptions')
    os.makedirs(images_dir, exist_ok=True)
    os.makedirs(transcriptions_dir, exist_ok=True)

    print(f"==================================================")
    print(f"  SEHATKOSH DATASET EXPORTER")
    print(f"==================================================")
    print(f"Region:    {args.region}")
    print(f"Table:     {args.table}")
    print(f"Bucket:    {args.bucket}")
    print(f"Output:    {base_dir}")
    print(f"==================================================")

    # Initialize AWS clients
    session = boto3.Session(region_name=args.region)
    dynamodb = session.resource('dynamodb')
    s3 = session.client('s3')
    table = dynamodb.Table(args.table)

    # Scan DynamoDB table for records
    print("\n[1/3] Scanning DynamoDB records...")
    scan_kwargs = {}
    if not args.all_statuses:
        scan_kwargs['FilterExpression'] = 'attribute_exists(s3_sanitized_key) AND (#st = :verified)'
        scan_kwargs['ExpressionAttributeNames'] = {'#st': 'status'}
        scan_kwargs['ExpressionAttributeValues'] = {':verified': 'VERIFIED'}

    items = []
    done = False
    start_key = None

    while not done:
        if start_key:
            scan_kwargs['ExclusiveStartKey'] = start_key
        response = table.scan(**scan_kwargs)
        items.extend(response.get('Items', []))
        start_key = response.get('LastEvaluatedKey', None)
        done = start_key is None

    print(f"Found {len(items)} record(s) to export.")

    if not items:
        print("No records found to download.")
        return

    # Process and download each paired entry
    print("\n[2/3] Downloading images from S3 and exporting text...")
    dataset_records = []

    for index, item in enumerate(items, start=1):
        donation_id = item.get('donation_id') or item.get('PK', '').replace('DONATION#', '')
        s3_key = item.get('s3_sanitized_key')
        transcription = item.get('transcription', '')

        # Clean stripped transcription for easy reading
        clean_text = transcription
        if clean_text.startswith('<donor_transcription>') and clean_text.endswith('</donor_transcription>'):
            clean_text = clean_text[len('<donor_transcription>'):-len('</donor_transcription>')].strip()

        # 1. Download image from S3
        image_local_path = None
        if s3_key:
            image_filename = f"{donation_id}.webp"
            image_dest = os.path.join(images_dir, image_filename)
            try:
                s3.download_file(args.bucket, s3_key, image_dest)
                image_local_path = os.path.relpath(image_dest, base_dir)
            except ClientError as e:
                print(f"  [Warning] Failed to download {s3_key}: {e}")

        # 2. Save transcription text file
        txt_filename = f"{donation_id}.txt"
        txt_dest = os.path.join(transcriptions_dir, txt_filename)
        with open(txt_dest, 'w', encoding='utf-8') as f:
            f.write(transcription)

        txt_local_path = os.path.relpath(txt_dest, base_dir)

        # 3. Add to metadata ledger
        record_entry = {
            'donation_id': donation_id,
            'status': item.get('status', 'UNKNOWN'),
            'image_file': image_local_path,
            'transcription_file': txt_local_path,
            'transcription_clean': clean_text,
            'char_count': int(item.get('char_count', len(transcription))),
            'image_dimensions': item.get('image_dimensions', 'N/A'),
            'file_size_bytes': int(item.get('file_size', 0)),
            'ip_fingerprint': item.get('ip_fingerprint', 'UNKNOWN'),
            'geo_city': item.get('geo_city', 'UNKNOWN'),
            'geo_country': item.get('geo_country', 'UNKNOWN'),
            'verified_at': int(item.get('verified_at', item.get('created_at', 0))),
            's3_bucket': args.bucket,
            's3_key': s3_key,
        }
        dataset_records.append(record_entry)
        print(f"  ({index}/{len(items)}) Exported: {donation_id} -> {image_local_path}")

    # 4. Write consolidated dataset.json
    print("\n[3/3] Generating consolidated catalog files...")
    json_path = os.path.join(base_dir, 'dataset.json')
    with open(json_path, 'w', encoding='utf-8') as f:
        json.dump(dataset_records, f, indent=2, ensure_ascii=False)
    print(f"  Saved JSON index: {json_path}")

    # 5. Write CSV spreadsheet
    csv_path = os.path.join(base_dir, 'dataset.csv')
    fieldnames = [
        'donation_id', 'status', 'image_file', 'transcription_file',
        'transcription_clean', 'char_count', 'image_dimensions',
        'file_size_bytes', 'geo_country', 'geo_city', 'verified_at', 's3_key'
    ]
    with open(csv_path, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction='ignore')
        writer.writeheader()
        writer.writerows(dataset_records)
    print(f"  Saved CSV index:  {csv_path}")

    print("\n==================================================")
    print(f"  EXPORT COMPLETED SUCCESSFULLY!")
    print(f"  Total Paired Samples: {len(dataset_records)}")
    print(f"  Folder Location:      {base_dir}")
    print(f"==================================================")

if __name__ == '__main__':
    main()
