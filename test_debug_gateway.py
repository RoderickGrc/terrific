#!/usr/bin/env python3

import requests
import json
import time
import sys
from datetime import datetime
import random

API_URL = 'http://localhost:3001'
INGEST_PATH = '/api/sessions/ingest'

# Helper: Send log to server
def send_log(lvl, src, message, data=None):
    """Send a log message to the debug gateway"""
    if data is None:
        data = {}
    
    payload = {
        'lvl': lvl,
        'src': src,
        'message': message,
        'data': data
    }
    
    try:
        response = requests.post(
            f"{API_URL}{INGEST_PATH}",
            json=payload,
            headers={'Content-Type': 'application/json'},
            timeout=5
        )
        
        if response.status_code == 200:
            return response.json()
        else:
            raise Exception(f"Server returned {response.status_code}: {response.text}")
    except requests.RequestException as e:
        raise Exception(f"Request failed: {str(e)}")

# Check if server is available
def check_server():
    """Check if the server is running and available"""
    try:
        response = requests.get(
            f"{API_URL}/api/sessions",
            timeout=3
        )
        return response.status_code < 500
    except requests.RequestException:
        return False

# Option 1: Send single message
def send_single_message():
    """Send a single test message"""
    print('\n📤 Sending single test message...')
    try:
        result = send_log(
            'log',
            'test-script',
            'Single test message from debug gateway test',
            {
                'timestamp': datetime.now().isoformat(),
                'test': True
            }
        )
        print(f"✅ Message sent successfully! {result.get('message', 'OK')}")
    except Exception as err:
        print(f"❌ Error: {str(err)}")

# Option 2: Send multiple consecutive messages
def send_multiple_messages():
    """Send multiple messages over time"""
    print('\n📤 Streaming mode activated. Sending messages every 2-3 seconds...')
    print('Press Ctrl+C to stop.\n')
    
    max_messages = 10
    
    try:
        for count in range(1, max_messages + 1):
            # Determine log level based on count
            if count % 3 == 0:
                lvl = 'error'
            elif count % 2 == 0:
                lvl = 'warn'
            else:
                lvl = 'log'
            
            try:
                result = send_log(
                    lvl,
                    'streaming-test',
                    f"Streaming message #{count}",
                    {
                        'count': count,
                        'timestamp': datetime.now().isoformat(),
                        'randomValue': random.random()
                    }
                )
                print(f"✅ [{count}/{max_messages}] Sent: {result.get('message', 'OK')}")
            except Exception as err:
                print(f"❌ [{count}] Error: {str(err)}")
            
            # Wait before next message (except for the last one)
            if count < max_messages:
                time.sleep(2.5)  # 2.5 seconds between messages
        
        print('\n✅ Streaming complete!')
    except KeyboardInterrupt:
        print('\n\n⚠️  Streaming interrupted by user')

# Option 3: Send custom message
def send_custom_message():
    """Send a custom message with user-defined parameters"""
    print('\n📝 Custom Message Mode\n')
    
    lvl = input('Level (log/warn/error): ').strip() or 'log'
    src = input('Source (e.g., backend, api, worker): ').strip() or 'custom'
    message = input('Message: ').strip() or 'Custom test message'
    
    try:
        result = send_log(
            lvl,
            src,
            message,
            {
                'custom': True,
                'timestamp': datetime.now().isoformat()
            }
        )
        print(f"✅ Custom message sent! {result.get('message', 'OK')}")
    except Exception as err:
        print(f"❌ Error: {str(err)}")

# Show interactive menu
def show_menu():
    """Display the interactive menu and handle user input"""
    while True:
        print('\n' + '=' * 50)
        print('🧪 Debug Gateway Test Tool')
        print('=' * 50)
        print('\n1. Send single test message')
        print('2. Stream multiple messages (10 messages)')
        print('3. Send custom message')
        print('4. Exit\n')
        
        answer = input('Select option (1-4): ').strip()
        
        if answer == '1':
            send_single_message()
        elif answer == '2':
            send_multiple_messages()
        elif answer == '3':
            send_custom_message()
        elif answer == '4':
            print('\n👋 Goodbye!\n')
            sys.exit(0)
        else:
            print('❌ Invalid option')

# Main
def main():
    """Main entry point"""
    print('\n🔍 Checking server availability...')
    is_available = check_server()
    
    if not is_available:
        print('❌ Server not available at http://localhost:3001')
        print('Please start the server first: cd backend && npm run dev\n')
        sys.exit(1)
    
    print('✅ Server is available!\n')
    
    try:
        show_menu()
    except KeyboardInterrupt:
        print('\n\n👋 Goodbye!\n')
        sys.exit(0)

if __name__ == '__main__':
    main()
