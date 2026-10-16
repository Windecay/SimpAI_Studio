import json
import os
import re
from datetime import datetime
from pathlib import Path


_NAME = re.compile(r"description_\d{8}T\d{6}Z_[0-9a-f]{32}\.json")


def save_record(report, output_root):
    identifier = str(report.get("id") or "")
    if not re.fullmatch(r"[0-9a-f]{32}", identifier):
        raise ValueError("Invalid description record ID.")
    stamp = datetime.fromisoformat(report["created_at"]).strftime("%Y%m%dT%H%M%SZ")
    directory = Path(output_root) / "description_records"
    directory.mkdir(parents=True, exist_ok=True)
    path = directory / f"description_{stamp}_{identifier}.json"
    if not path.exists():
        with path.open("x", encoding="utf-8") as handle:
            json.dump(report, handle, ensure_ascii=False, indent=2)
    return str(path)


def list_records(output_root, limit=50):
    directory = Path(output_root) / "description_records"
    if not directory.is_dir():
        return []
    with os.scandir(directory) as entries:
        names = sorted(
            (entry.name for entry in entries if _NAME.fullmatch(entry.name) and entry.is_file()),
            reverse=True,
        )
    return names[:limit]


def load_record(output_root, name):
    if not isinstance(name, str) or not _NAME.fullmatch(name):
        raise ValueError("Invalid description record filename.")
    directory = (Path(output_root) / "description_records").resolve()
    path = (directory / name).resolve()
    if path.parent != directory:
        raise ValueError("Description record is outside the current output directory.")
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle), str(path)


_ISSUES = {
    "no_descriptive_text": ("No descriptive prose", "未识别到描述正文"),
    "empty_output": ("No final text", "没有最终正文"),
    "insufficient_detail": ("Less detail than requested", "详细程度不足"),
    "too_few_sentences": ("Too few sentences", "句子数量不足"),
    "unfinished_sentence": ("The last sentence is incomplete", "最后一句不完整"),
    "not_one_paragraph": ("More than one paragraph or a structured wrapper", "包含多段内容或结构包装"),
    "headings_or_list": ("Contains headings or a list", "包含标题或列表"),
    "wrong_language": ("Different output language", "输出语言不符"),
    "preamble_or_explanation": ("Contains an introduction or explanation", "包含开场白或解释"),
    "invalid_prompt_wrapper": ("Output format could not be parsed", "无法解析输出格式"),
    "inference_failed": ("Inference did not complete", "推理未完成"),
}


def status_text(report, index=-1, language="cn", archive_error=""):
    english = str(language).lower().startswith("en")
    def text(en, cn):
        return en if english else cn
    attempts = report.get("attempts") or []
    stopped = report.get("error") == "cancelled"
    unconfirmed = report.get("error") == "stop_unconfirmed"
    if unconfirmed:
        stop_message = text(
            "The backend did not confirm the stop. Check its task queue before retrying. The original prompt was preserved.",
            "后端未确认停止，请查看后端任务队列后再决定是否重试。原提示词已保留。",
        )
    else:
        stop_message = text("Description stopped. The original prompt was preserved.", "反推已停止，原提示词已保留。")
    if not attempts:
        message = stop_message if stopped or unconfirmed else text("No model output was returned.", "模型没有返回内容。")
        if archive_error:
            message += "\n\n" + text("Archive failed: ", "存档失败：") + archive_error
        return message
    entry = attempts[index]
    if stopped or unconfirmed:
        lines = [stop_message, (
            text("Returned output is preserved below.", "已返回的内容保留在下方。")
            if entry.get("raw_output") or entry.get("reasoning_output")
            else text("This model call did not return text.", "这次模型调用没有返回正文。")
        )]
    elif entry.get("hit_token_limit"):
        lines = [text("Token limit reached. Review the returned text before using it.", "已达到 token 上限，请查看返回内容后决定是否使用。")]
    elif report.get("accepted") and index in (-1, len(attempts) - 1):
        lines = [text("Description accepted.", "反推结果已通过校验。")]
    else:
        lines = [text("Output preserved for review; the prompt was not replaced.", "输出已保留供查看，未替换原提示词。")]
    count = entry.get("generated_tokens")
    limit = entry.get("max_tokens") or (report.get("settings") or {}).get("max_tokens")
    if count is not None:
        lines.append(text(f"Generated tokens: {count} / {limit}.", f"生成 tokens：{count} / {limit}。"))
    elif limit:
        lines.append(text(f"Token limit: {limit}; usage was not reported by this backend.", f"Token 上限：{limit}；此后端未报告实际用量。"))
    issues = (entry.get("review") or {}).get("issues") or []
    if issues:
        labels = [_ISSUES.get(issue, (issue, issue))[0 if english else 1] for issue in issues]
        lines.append(text("Checks: ", "校验提示：") + ("; " if english else "；").join(labels))
    if entry.get("error") and not stopped:
        lines.append(text("Error: ", "错误：") + str(entry["error"]))
    if archive_error:
        lines.append(text("Archive failed: ", "存档失败：") + archive_error)
    return "\n\n".join(lines)
