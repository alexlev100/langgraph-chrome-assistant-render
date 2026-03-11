from typing import Any


def summarize_forms(page_details: dict[str, Any]) -> str:
    forms = page_details.get("forms") or []
    if not forms:
        return "No forms detected on the current page."

    lines: list[str] = [f"Detected {len(forms)} forms."]
    for index, form in enumerate(forms[:5], start=1):
        form_id = form.get("id") or f"form_{index}"
        method = form.get("method") or "GET"
        action = form.get("action") or ""
        fields = form.get("fields") or []
        field_names = [field.get("name") or field.get("type") or "unknown" for field in fields[:8]]
        lines.append(
            f"{index}. id={form_id}; method={method}; action={action}; fields={', '.join(field_names)}"
        )

    return "\n".join(lines)
