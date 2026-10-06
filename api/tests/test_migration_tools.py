"""Operational verification uses the real /chat usage contract."""
import importlib.util
from pathlib import Path

import pytest


@pytest.fixture
def evaluation_tool():
    path = Path(__file__).resolve().parents[2] / "scripts/verify-demo-cache.py"
    spec = importlib.util.spec_from_file_location("demo_cache_evaluation", path)
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_repeat_accepts_actual_backend_zero_generation_usage(evaluation_tool):
    evaluation_tool.validate_repeat(
        {"cache_status": "hit", "cost_usd": 0,
         "usage": {"input_tokens": 0, "output_tokens": 0}}, "finance-01"
    )


@pytest.mark.parametrize("usage", [
    {"input_tokens": 12, "output_tokens": 0},
    {"input_tokens": 0, "output_tokens": 34},
    {"total_tokens": 0},
    None,
])
def test_repeat_rejects_nonzero_or_missing_generation_usage(evaluation_tool, usage):
    with pytest.raises(SystemExit, match="Repeat cache/cost check failed for finance-01"):
        evaluation_tool.validate_repeat(
            {"cache_status": "hit", "cost_usd": 0, "usage": usage}, "finance-01"
        )
