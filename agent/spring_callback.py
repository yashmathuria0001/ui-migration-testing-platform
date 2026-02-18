import os
import requests
from dotenv import load_dotenv

load_dotenv()

SPRING_BASE_URL = os.getenv("SPRING_BASE_URL")


def mark_running(test_id: str):
    url = f"{SPRING_BASE_URL}/api/execution/{test_id}/start"
    requests.put(url)


def mark_completed(test_id: str, report_path: str = None):
    url = f"{SPRING_BASE_URL}/api/execution/{test_id}/complete"

    payload = {
        "results": [],
        "reportPath": report_path
    }

    requests.put(url, json=payload)


def mark_failed(test_id: str, error_message: str):
    url = f"{SPRING_BASE_URL}/api/execution/{test_id}/fail"

    payload = {
        "errorMessage": error_message
    }

    requests.put(url, json=payload)
