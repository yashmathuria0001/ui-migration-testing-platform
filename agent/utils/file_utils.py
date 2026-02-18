import os

def save_script(code: str, test_run_id: str):
    folder = "generated_scripts"
    os.makedirs(folder, exist_ok=True)

    file_path = f"{folder}/test_{test_run_id}.py"

    with open(file_path, "w") as f:
        f.write(code)

    return file_path
