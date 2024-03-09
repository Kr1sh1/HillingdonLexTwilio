import json
import datetime
import numpy as np
import pandas as pd
from openai import OpenAI
import os
from typing import Sequence, Dict, Optional

MODEL = "gpt-4-1106-preview"
PROMPT_PATH = 'data/prompt.txt'
KNOWLEDGE_BASE_PATH = 'data/knowledge_base/'

OPENAI_API_KEY = "INSERT_KEY_HERE"


def init_functions():
    tools = [
        {
            "type": "function",
            "function": {
                "name": "save_user_name",
                "description": "Save the user's first and last name for personalized interactions",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "firstName": {
                            "type": "string",
                            "description": "The user's first name"
                        },
                        "lastName": {
                            "type": "string",
                            "description": "The user's last name"
                        }
                    },
                    "required": [
                        "firstName",
                        "lastName"
                    ]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "save_user_address",
                "description": "Save the user's address for future reference",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "street": {
                            "type": "string",
                            "description": "The user's street address"
                        },
                        "house_number": {
                            "type": "string",
                            "description": "The user's house number"
                        },
                        "post_code": {
                            "type": "string",
                            "description": "The user's postal code"
                        },
                        "address": {
                            "type": "string",
                            "description": "The user's full address (optional, if you still want to provide it as a single string)"
                        }
                    },
                    "required": [
                        "street",
                        "house_number",
                        "post_code"
                    ]
                }
            }
        },
        {
            "type": "function",
            "function": {
                "name": "determine_bag_type",
                "description": "Determines which type of rubbish bags a user wants (recycling or general waste)",
                "parameters": {
                    "type": "object",
                    "properties": {
                        "bag_type": {
                            "type": "string",
                            "description": "The type of rubbish bags the user wants. Should be either 'recycling' or 'general waste'."
                        }
                    },
                    "required": [
                        "bag_type"
                    ]
                }
            }
        },
        {"type": "retrieval"},
    ]

    return tools


def update_date_in_prompt_file(prompt_path):
    # Get the current date
    current_date = datetime.datetime.now().strftime('%d/%m/%Y')

    with open(prompt_path, 'r') as file:
        content = file.read()

    updated_content = content.replace('{current_date}', current_date)

    with open(prompt_path, 'w') as file:
        file.write(updated_content)


def clean_up(prompt_path):
    with open(prompt_path, 'r') as file:
        content = file.read()

    current_date = datetime.datetime.now().strftime('%d/%m/%Y')
    updated_content = content.replace(f'{current_date}', '{current_date}')

    with open(prompt_path, 'w') as file:
        file.write(updated_content)


def load_knowledge_base(client, dir_path):
    ids = []
    for filename in os.listdir(dir_path):
        file_path = os.path.join(dir_path, filename)
        if os.path.isfile(file_path):
            with open(file_path, "rb") as file:
                uploaded_file = client.files.create(
                    file=file,
                    purpose='assistants'
                )
            ids.append(uploaded_file.id)
    return ids


def create_assistant(client):
    update_date_in_prompt_file(prompt_path=PROMPT_PATH)
    with open(PROMPT_PATH, 'r', encoding='utf-8') as file:
        prompt = file.read()

    assistant = client.beta.assistants.create(
        name=f"Hillingdon Lex v1.{datetime.datetime.now().strftime('%d.%m.%Y')}",
        description=" You are a kind, smart, and empathetic assistant named Hillingdon Lex.",
        instructions=prompt,
        model=MODEL,
        tools=init_functions(),
        file_ids=load_knowledge_base(client, KNOWLEDGE_BASE_PATH),

    )

    return assistant


def main():
    client = OpenAI(
        api_key=OPENAI_API_KEY
    )

    assistant = create_assistant(client)
    thread = client.beta.threads.create()



if __name__ == "__main__":
    main()