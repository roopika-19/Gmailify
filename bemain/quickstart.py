import sys
import json
import base64
import datetime
import asyncio
import os
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
import google.generativeai as genai
import pywhatkit
from tenacity import retry, wait_exponential, stop_after_attempt, retry_if_exception_type

retry_config = {
    'wait': wait_exponential(multiplier=1, min=4, max=10),
    'stop': stop_after_attempt(5),
    'retry': retry_if_exception_type((TimeoutError, ConnectionError))
}

SCOPES = ['https://www.googleapis.com/auth/gmail.readonly']
genai.configure(api_key="AIzaSyBUiQ497Inc9lBHA9VbT81BtyKtex7IpjU")
model_name = 'gemini-pro'
model = genai.GenerativeModel(model_name)

def get_message_body(message):
    if 'data' in message['payload']['body']:
        return base64.urlsafe_b64decode(message['payload']['body']['data'].encode('ASCII')).decode('utf-8')
    else:
        parts = message['payload'].get('parts', [])
        for part in parts:
            if part['mimeType'] == 'text/plain' and 'data' in part['body']:
                return base64.urlsafe_b64decode(part['body']['data'].encode('ASCII')).decode('utf-8')
    return None

async def process_main_async(messages, service, model, user_id):
    tasks = [worker2(message, service, model, user_id) for message in messages]
    return await asyncio.gather(*tasks)

@retry(**retry_config)
async def worker2(message, service, model, user_id):
    msg = service.users().messages().get(userId=user_id, id=message['id']).execute()
    snippet = msg.get('snippet', 'No snippet available')
    body = get_message_body(msg)
    prompt = f"Summarize the following email for a text message with the sender's name:\n\n{snippet}\n\n{body}"
    response = model.generate_content(prompt)
    return response.text

@retry(**retry_config)
async def fetch_emails_for_user(creds, user_id):
    service = build('gmail', 'v1', credentials=creds)
    today = datetime.datetime.now()
    yesterday = today - datetime.timedelta(days=1)
    formatted_yesterday = yesterday.strftime('%Y/%m/%d')

    response = service.users().messages().list(userId=user_id, q=f'after:{formatted_yesterday}').execute()
    messages = response.get('messages', [])

    while 'nextPageToken' in response:
        page_token = response['nextPageToken']
        response = service.users().messages().list(userId=user_id, q=f'after:{formatted_yesterday}', pageToken=page_token).execute()
        messages.extend(response.get('messages', []))

    summaries = await process_main_async(messages, service, model, user_id)
    return summaries

async def main(email, phone_number, creds):
    user_id = email.strip()
    summaries = await fetch_emails_for_user(creds, user_id)
    full_message = "\n".join(summaries)
    phone_number_with_country_code = "+91" + phone_number.lstrip("+")
    pywhatkit.sendwhatmsg(phone_number_with_country_code, full_message, 3, 28) 

if __name__ == '__main__':
    userData = json.loads(sys.argv[1])
    email = userData['email']
    accessToken = userData['accessToken']
    refreshToken = userData['refreshToken']
    expiresAt = userData['expiresAt']
    phoneNumber = userData['phoneNumber']
    print("hiiii")
    creds = Credentials(
        token=accessToken,
        refresh_token=refreshToken,
        token_uri='https://oauth2.googleapis.com/token',
        client_id=os.getenv('GOOGLE_CLIENT_ID'),  
        client_secret=os.getenv('GOOGLE_CLIENT_SECRET')
    )

    asyncio.run(main(email, phoneNumber, creds))
