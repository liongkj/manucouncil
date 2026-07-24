from pydantic import BaseModel, Field
from typing import Literal


class ModelRef(BaseModel):
    provider: str
    model: str


class PresetMember(BaseModel):
    id: str
    role: str
    model: ModelRef
    contract: str
    skip_in_critique: bool = False


class PresetChair(BaseModel):
    model: ModelRef
    contract: str


class PresetConfig(BaseModel):
    id: str
    label: str
    group: Literal["quick", "council"]
    description: str
    members: list[PresetMember]
    chair: PresetChair | None = None
    skip_critique: bool = False
    skip_chair: bool = False
    sequential: bool = False


class ChatRequest(BaseModel):
    text: str
    model: ModelRef
    stream: bool = True
    system: str | None = None
    session_id: str | None = None


class ChatResponse(BaseModel):
    text: str
    model: ModelRef


class CouncilRequest(BaseModel):
    text: str
    preset_id: str
    scratchpad: str | None = None
    model_overrides: dict[str, ModelRef] | None = None


class Critique(BaseModel):
    reviewer_id: str
    rankings: list[str]
    strongest_points: list[str]
    weaknesses: dict[str, list[str]]
    disagreements: list[str]


class MemberResult(BaseModel):
    member_id: str
    role: str
    model: ModelRef
    analysis: str
    recommendation: str | None
    risks: list[str]
    confidence: float


class ChairResult(BaseModel):
    verdict: str
    consensus: list[str]
    disagreements: list[str]
    scientific_risks: list[str]
    recommended_text: str | None
    rationale: str


class CouncilResponse(BaseModel):
    preset_id: str
    text: str
    chair: ChairResult | None
    members: list[MemberResult]
    critiques: list[Critique] | None


class SessionInfo(BaseModel):
    id: str
    title: str
    created_at: str
    messages: list


class SSEEvent(BaseModel):
    session_id: str
    type: str
    content: str
    done: bool = False
