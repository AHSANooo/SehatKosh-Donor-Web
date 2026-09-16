import urllib.request
import json
import boto3
import io
from PIL import Image

API_BASE = "https://k4k0wp8apc.execute-api.ap-south-1.amazonaws.com"

def run_test():
    print("1. Requesting upload session...")
    req = urllib.request.Request(
        f"{API_BASE}/session",
        data=json.dumps({"mime_type": "image/jpeg", "file_size": 2048}).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(req) as resp:
        session_data = json.loads(resp.read().decode())
    
    donation_id = session_data["donation_id"]
    upload_url = session_data["upload_url"]
    print(f"   Session obtained: {donation_id}")

    print("2. Generating test JPEG and uploading to S3 pre-signed URL...")
    img = Image.new('RGB', (100, 100), color=(73, 109, 137))
    buf = io.BytesIO()
    img.save(buf, format='JPEG')
    jpeg_bytes = buf.getvalue()

    upload_req = urllib.request.Request(
        upload_url,
        data=jpeg_bytes,
        headers={"Content-Type": "image/jpeg"},
        method='PUT'
    )
    with urllib.request.urlopen(upload_req) as resp:
        print(f"   Upload status: {resp.status}")

    print("3. Committing donation to /commit...")
    commit_payload = {
        "donation_id": donation_id,
        "transcription": "Live Geo Test: Patient Tariq prescribed Amoxicillin 500mg by Dr. Jamil (Phone: 0300-1234567)."
    }
    commit_req = urllib.request.Request(
        f"{API_BASE}/commit",
        data=json.dumps(commit_payload).encode(),
        headers={"Content-Type": "application/json"}
    )
    with urllib.request.urlopen(commit_req) as resp:
        commit_res = json.loads(resp.read().decode())
        print(f"   Commit response: {commit_res}")

    print("4. Fetching DynamoDB record to verify geolocation fields...")
    dynamodb = boto3.resource('dynamodb', region_name='ap-south-1')
    table = dynamodb.Table('sehatkosh-donations')
    item = table.get_item(Key={'PK': f"DONATION#{donation_id}"}).get('Item', {})

    print(f"   DynamoDB Item:")
    print(f"   - Country: {item.get('geo_country')}")
    print(f"   - City:    {item.get('geo_city')}")
    print(f"   - IP Hash: {item.get('ip_fingerprint')}")
    print(f"   - Status:  {item.get('status')}")

if __name__ == '__main__':
    run_test()
