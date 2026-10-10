import json
import logging
import time


logger = logging.getLogger(__name__)
PE_OUTPUT_KEY = "simpai_pe"
PE_STATUSES = {"rewritten", "unavailable", "empty_output", "invalid_output", "disabled"}


def _model_key(name):
    return str(name or "").replace("\\", "/").casefold()


def pe_result_from_history(history, model):
    outputs = history.get("outputs") if isinstance(history, dict) else None
    if not isinstance(outputs, dict):
        return None
    for output in outputs.values():
        records = output.get(PE_OUTPUT_KEY) if isinstance(output, dict) else None
        if not isinstance(records, list):
            continue
        for record in records:
            if (isinstance(record, dict)
                    and isinstance(record.get("model"), str)
                    and _model_key(record.get("model")) == _model_key(model)
                    and isinstance(record.get("prompt"), str)
                    and isinstance(record.get("status"), str)
                    and record.get("status") in PE_STATUSES):
                return {key: record[key] for key in ("model", "prompt", "status")}
    return None


def capture_pe_result(pipeline, prompt_id, model, task, timeout_seconds=2.0):
    if model in (None, "", "None"):
        return
    task["pe_model"] = model
    task["pe_status"] = "unrecorded"
    task.pop("pe_prompt", None)
    deadline = time.monotonic() + max(0.0, timeout_seconds)
    if prompt_id:
        while True:
            try:
                history = pipeline.get_history_item(prompt_id)
            except Exception as error:
                logger.warning("PE metadata read failed: prompt_id=%s error=%s", prompt_id, error)
                break
            if history is not None:
                result = pe_result_from_history(history, model)
                if result is not None:
                    task["pe_model"] = result["model"]
                    task["pe_status"] = result["status"]
                    task["pe_prompt"] = result["prompt"]
                    task["positive"] = [result["prompt"]]
                    logger.info(
                        "PE output: prompt_id=%s model=%s status=%s prompt=%s",
                        prompt_id, result["model"], result["status"],
                        json.dumps(result["prompt"], ensure_ascii=False),
                    )
                    return
                break
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                break
            time.sleep(min(0.05, remaining))
    logger.warning("PE output was not recorded: prompt_id=%s model=%s", prompt_id, model)


def pe_metadata_rows(task, model=None):
    model = task.get("pe_model", model)
    if model in (None, "", "None"):
        return []
    rows = [("PE Model", "pe_model", model)]
    if task.get("pe_status"):
        rows.append(("PE Status", "pe_status", task["pe_status"]))
    if isinstance(task.get("pe_prompt"), str):
        rows.append(("PE Prompt", "pe_prompt", task["pe_prompt"]))
    return rows
