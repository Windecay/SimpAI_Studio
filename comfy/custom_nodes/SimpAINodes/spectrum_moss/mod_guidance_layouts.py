"""Block-layout adaptation for modulation-guidance schedules.

The pooled-text projection is width-dependent but not depth-dependent. Named
profiles, however, were calibrated against Anima's original 28 transformer
blocks. Expanded models therefore need a provenance map for the per-block
steering schedule rather than a proportional index guess.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple


SCHEDULE_BASIS_NATIVE = "native"
SCHEDULE_BASIS_ANIMA_BASE_28 = "anima_base_28"


@dataclass(frozen=True)
class BlockExpansionLayout:
    """Verified source-to-target block lineage for one expanded architecture."""

    name: str
    model_family: str
    model_channels: int
    source_block_count: int
    target_block_count: int
    source_to_target: Tuple[int, ...]
    inserted_to_source: Tuple[Tuple[int, int], ...]

    def remap_source_anchors(self, source_schedule: Sequence[float]) -> List[float]:
        """Move source weights onto preserved source blocks in the target model.

        Inserted blocks intentionally remain at zero. They were not part of the
        source model used to train and calibrate the modulation adapter.
        """

        if len(source_schedule) != self.source_block_count:
            raise ValueError(
                f"{self.name} expects {self.source_block_count} source weights, "
                f"got {len(source_schedule)}"
            )
        if len(self.source_to_target) != self.source_block_count:
            raise ValueError(f"{self.name} has an invalid source-to-target map")

        target_schedule = [0.0] * self.target_block_count
        for source_index, target_index in enumerate(self.source_to_target):
            if target_index < 0 or target_index >= self.target_block_count:
                raise ValueError(
                    f"{self.name} maps source block {source_index} outside the target"
                )
            target_schedule[target_index] = float(source_schedule[source_index])
        return target_schedule


# Gazingstars123/Anima-2.9B expand_manifest.json. These are target indices.
ANIMA_29B_INSERTION_POSITIONS = (
    2,
    5,
    8,
    11,
    14,
    17,
    21,
    24,
    27,
    30,
    33,
    36,
)
ANIMA_29B_SOURCE_TO_TARGET = tuple(
    target_index
    for target_index in range(40)
    if target_index not in ANIMA_29B_INSERTION_POSITIONS
)
ANIMA_29B_INSERTED_TO_SOURCE = (
    (2, 1),
    (5, 3),
    (8, 5),
    (11, 7),
    (14, 9),
    (17, 11),
    (21, 14),
    (24, 16),
    (27, 18),
    (30, 20),
    (33, 22),
    (36, 24),
)

ANIMA_29B_LAYOUT = BlockExpansionLayout(
    name="anima-2.9b-40-source-anchors",
    model_family="anima",
    model_channels=2048,
    source_block_count=28,
    target_block_count=40,
    source_to_target=ANIMA_29B_SOURCE_TO_TARGET,
    inserted_to_source=ANIMA_29B_INSERTED_TO_SOURCE,
)

KNOWN_BLOCK_EXPANSIONS = (ANIMA_29B_LAYOUT,)


def find_block_expansion_layout(
    *,
    model_family: str,
    model_channels: Optional[int],
    source_block_count: int,
    target_block_count: int,
) -> Optional[BlockExpansionLayout]:
    """Return a verified layout only when the full architecture signature matches."""

    family = str(model_family or "").lower()
    for layout in KNOWN_BLOCK_EXPANSIONS:
        if (
            layout.model_family == family
            and layout.model_channels == model_channels
            and layout.source_block_count == source_block_count
            and layout.target_block_count == target_block_count
        ):
            return layout
    return None


def resolve_source_anchor_schedule(
    source_schedule: Sequence[float],
    *,
    model_family: str,
    model_channels: Optional[int],
    target_block_count: int,
) -> Tuple[Optional[List[float]], Optional[str]]:
    """Resolve a source-calibrated schedule for a live target architecture.

    Equal-depth models preserve the source schedule exactly. Expanded models
    require an explicit verified descriptor; ``(None, None)`` asks the caller
    to retain its legacy native-index behavior for unknown layouts.
    """

    source_block_count = len(source_schedule)
    if target_block_count == source_block_count:
        return list(source_schedule), f"source-{source_block_count}-identity"

    layout = find_block_expansion_layout(
        model_family=model_family,
        model_channels=model_channels,
        source_block_count=source_block_count,
        target_block_count=target_block_count,
    )
    if layout is None:
        return None, None
    return layout.remap_source_anchors(source_schedule), layout.name


__all__ = [
    "ANIMA_29B_INSERTED_TO_SOURCE",
    "ANIMA_29B_INSERTION_POSITIONS",
    "ANIMA_29B_LAYOUT",
    "ANIMA_29B_SOURCE_TO_TARGET",
    "BlockExpansionLayout",
    "SCHEDULE_BASIS_ANIMA_BASE_28",
    "SCHEDULE_BASIS_NATIVE",
    "find_block_expansion_layout",
    "resolve_source_anchor_schedule",
]
