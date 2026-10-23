import re
from dataclasses import dataclass

EMERGENCY_MESSAGE = (
    "This description mentions a possible immediate hazard. If anyone is in "
    "danger, contact your local emergency services now. CivicBridge AI has not "
    "contacted anyone and cannot determine whether the situation is safe."
)


@dataclass(frozen=True)
class EmergencyRule:
    id: str
    label: str
    patterns: tuple[re.Pattern[str], ...]


def _patterns(*values: str) -> tuple[re.Pattern[str], ...]:
    return tuple(re.compile(value, re.IGNORECASE | re.DOTALL) for value in values)


# These rules are deliberately conservative and independent of Gemini. A match
# means "show a safety warning", never "this is definitely an emergency".
EMERGENCY_RULES: tuple[EmergencyRule, ...] = (
    EmergencyRule(
        id="gas_leak",
        label="possible gas leak",
        patterns=_patterns(
            r"\bgas\s+(?:leak|smell|odou?r)\b",
            r"\bsmell(?:ing|s)?\s+(?:of\s+)?gas\b",
            r"\bnatural\s+gas\b",
            r"\bgas\s+leaking\b",
        ),
    ),
    EmergencyRule(
        id="live_electrical",
        label="possible live electrical hazard",
        patterns=_patterns(
            r"\blive\s+(?:electrical\s+)?(?:wire|wires|cable|cables)\b",
            r"\bexposed\s+(?:electrical\s+)?(?:wire|wires|cable|cables)\b",
            r"\bdowned\s+(?:power\s+)?(?:line|lines|wire|wires)\b",
            r"\bpower\s+(?:line|lines)\s+(?:is\s+|are\s+)?down\b",
            r"\bsparking\s+(?:wire|wires|line|lines|cable|cables)\b",
            r"\belectric(?:al)?\s+(?:shock|hazard)\b",
            r"\belectrocut(?:ed|ion)\b",
        ),
    ),
    EmergencyRule(
        id="sinkhole_or_collapse",
        label="possible sinkhole or structural collapse",
        patterns=_patterns(
            r"\bsink\s?hole\b",
            r"\broad\s+collaps(?:e|ed|ing)\b",
            r"\bground\s+collaps(?:e|ed|ing)\b",
            r"\bbuilding\s+collaps(?:e|ed|ing)\b",
            r"\bwall\s+collaps(?:e|ed|ing)\b",
        ),
    ),
    EmergencyRule(
        id="injury",
        label="possible injury",
        patterns=_patterns(
            r"\b(?:person|someone|child|pedestrian|cyclist|driver|worker|resident)\s+"
            r"(?:was\s+|is\s+|got\s+|has\s+been\s+)?(?:injured|hurt|trapped|electrocuted)\b",
            r"\binjur(?:y|ies)\b",
            r"\bbleeding\b",
            r"\bunconscious\b",
            r"\bdrown(?:ing|ed)\b",
        ),
    ),
    EmergencyRule(
        id="flood_near_electrical",
        label="flooding near electrical equipment",
        patterns=_patterns(
            r"\bflood(?:ing|ed)?\b.{0,100}\b(?:electric(?:al)?|power|wire|wires|substation|transformer)\b",
            r"\b(?:electric(?:al)?|power|wire|wires|substation|transformer)\b.{0,100}\bflood(?:ing|ed)?\b",
            r"\bwater\b.{0,80}\b(?:substation|transformer|live\s+wire)\b",
        ),
    ),
    EmergencyRule(
        id="fire_or_explosion",
        label="possible fire or explosion",
        patterns=_patterns(
            r"\bon\s+fire\b",
            r"\bexplosion\b",
            r"\bexploded\b",
            r"\bbuilding\s+fire\b",
            r"\bsmoke\s+(?:coming|pouring)\b",
        ),
    ),
)


@dataclass(frozen=True)
class EmergencyDetection:
    triggered: bool
    matched_rule_ids: tuple[str, ...]
    matched_labels: tuple[str, ...]


def detect_emergency(text: str, location_hint: str | None = None) -> EmergencyDetection:
    haystack = f"{text}\n{location_hint or ''}"
    matched = tuple(
        rule
        for rule in EMERGENCY_RULES
        if any(pattern.search(haystack) for pattern in rule.patterns)
    )
    return EmergencyDetection(
        triggered=bool(matched),
        matched_rule_ids=tuple(rule.id for rule in matched),
        matched_labels=tuple(rule.label for rule in matched),
    )
