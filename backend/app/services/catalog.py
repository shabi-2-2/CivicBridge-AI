from dataclasses import dataclass

from app.schemas.analysis import FieldKey, IssueCategory, MissingPriority

FIELD_LABELS: dict[FieldKey, str] = {
    FieldKey.ISSUE_DESCRIPTION: "Issue description",
    FieldKey.ISSUE_FIRST_OBSERVED: "First observed",
    FieldKey.ISSUE_FREQUENCY: "Frequency",
    FieldKey.ISSUE_SCALE: "Scale or extent",
    FieldKey.ISSUE_IMPACT: "Impact",
    FieldKey.ISSUE_HAZARD: "Immediate hazard",
    FieldKey.LOCATION_STREET: "Street or landmark",
    FieldKey.LOCATION_CITY: "City or district",
    FieldKey.LOCATION_POSTAL_CODE: "Postal code",
    FieldKey.ISSUE_ACCESS_NOTES: "Access notes",
}

FIELD_QUESTIONS: dict[FieldKey, str] = {
    FieldKey.ISSUE_DESCRIPTION: "What exactly is wrong?",
    FieldKey.ISSUE_FIRST_OBSERVED: "When did you first notice it?",
    FieldKey.ISSUE_FREQUENCY: "Is this a one-off, intermittent, or ongoing problem?",
    FieldKey.ISSUE_SCALE: "How large or widespread is it?",
    FieldKey.ISSUE_IMPACT: "Who or what is affected?",
    FieldKey.ISSUE_HAZARD: "Is there any immediate danger to people or property?",
    FieldKey.LOCATION_STREET: "Which street, landmark, or address is closest?",
    FieldKey.LOCATION_CITY: "Which city, district, or neighbourhood is this in?",
    FieldKey.LOCATION_POSTAL_CODE: "What is the postal code? (optional)",
    FieldKey.ISSUE_ACCESS_NOTES: "Any access details a crew should know? (optional)",
}

FIELD_REASONS: dict[FieldKey, str] = {
    FieldKey.ISSUE_DESCRIPTION: "A precise description helps an agency identify the problem.",
    FieldKey.ISSUE_FIRST_OBSERVED: "Timing helps establish urgency and whether the issue is new.",
    FieldKey.ISSUE_FREQUENCY: "Recurrence helps distinguish a one-off fault from a persistent one.",
    FieldKey.ISSUE_SCALE: "Extent helps an agency estimate the resources required.",
    FieldKey.ISSUE_IMPACT: "Impact explains who is affected and why the report matters.",
    FieldKey.ISSUE_HAZARD: "Immediate danger needs a human safety check, not just a report.",
    FieldKey.LOCATION_STREET: "A street or landmark is usually needed to locate the issue.",
    FieldKey.LOCATION_CITY: "A city or district is usually needed to route a report.",
    FieldKey.LOCATION_POSTAL_CODE: "A postal code can speed up location matching.",
    FieldKey.ISSUE_ACCESS_NOTES: "Access notes help a crew find and reach the site.",
}

# Weight 3 = blocking, 2 = recommended, 1 = optional.
BASE_WEIGHTS: dict[FieldKey, int] = {
    FieldKey.ISSUE_DESCRIPTION: 3,
    FieldKey.ISSUE_FIRST_OBSERVED: 2,
    FieldKey.ISSUE_FREQUENCY: 2,
    FieldKey.ISSUE_SCALE: 2,
    FieldKey.ISSUE_IMPACT: 2,
    FieldKey.ISSUE_HAZARD: 3,
    FieldKey.LOCATION_STREET: 3,
    FieldKey.LOCATION_CITY: 3,
    FieldKey.LOCATION_POSTAL_CODE: 1,
    FieldKey.ISSUE_ACCESS_NOTES: 1,
}

CATEGORY_WEIGHT_OVERRIDES: dict[IssueCategory, dict[FieldKey, int]] = {
    IssueCategory.POTHOLE: {FieldKey.ISSUE_SCALE: 3},
    IssueCategory.ROAD_DAMAGE: {FieldKey.ISSUE_IMPACT: 3},
    IssueCategory.GARBAGE: {FieldKey.ISSUE_HAZARD: 2},
    IssueCategory.STREETLIGHT: {FieldKey.ISSUE_HAZARD: 2, FieldKey.ISSUE_SCALE: 2},
    IssueCategory.WATER_LEAK: {FieldKey.ISSUE_IMPACT: 3},
    IssueCategory.DRAINAGE: {FieldKey.ISSUE_SCALE: 3},
    IssueCategory.SIDEWALK: {FieldKey.ISSUE_HAZARD: 2, FieldKey.ISSUE_ACCESS_NOTES: 2},
    IssueCategory.OTHER: {},
}

CATEGORY_GUIDANCE: dict[IssueCategory, tuple[str, str]] = {
    IssueCategory.POTHOLE: (
        "Use your municipal roads or public works reporting channel and include the exact location.",
        "municipal_website",
    ),
    IssueCategory.ROAD_DAMAGE: (
        "Use your municipal roads or public works reporting channel and include the exact location.",
        "municipal_website",
    ),
    IssueCategory.GARBAGE: (
        "Use your municipal waste or sanitation reporting channel and mention collection delays.",
        "municipal_website",
    ),
    IssueCategory.STREETLIGHT: (
        "Use your municipal lighting, roads, or public works reporting channel and include the pole location.",
        "municipal_website",
    ),
    IssueCategory.WATER_LEAK: (
        "Use your municipal water utility's official reporting channel. Keep clear of water near electrical equipment.",
        "utility",
    ),
    IssueCategory.DRAINAGE: (
        "Use your municipal drainage or public works reporting channel and describe the flooded area.",
        "municipal_website",
    ),
    IssueCategory.SIDEWALK: (
        "Use your municipal public works reporting channel and note the affected path or crossing.",
        "municipal_website",
    ),
    IssueCategory.OTHER: (
        "Find your municipality's official civic reporting channel and choose the closest category.",
        "municipal_website",
    ),
}


@dataclass(frozen=True)
class FieldSpec:
    key: FieldKey
    label: str
    weight: int
    question: str
    reason: str

    @property
    def priority(self) -> MissingPriority:
        if self.weight >= 3:
            return MissingPriority.BLOCKING
        if self.weight == 2:
            return MissingPriority.RECOMMENDED
        return MissingPriority.OPTIONAL


def weight_for(category: IssueCategory, key: FieldKey) -> int:
    return CATEGORY_WEIGHT_OVERRIDES.get(category, {}).get(key, BASE_WEIGHTS[key])


def catalog_for(category: IssueCategory) -> list[FieldSpec]:
    return [
        FieldSpec(
            key=key,
            label=FIELD_LABELS[key],
            weight=weight_for(category, key),
            question=FIELD_QUESTIONS[key],
            reason=FIELD_REASONS[key],
        )
        for key in FieldKey
    ]
