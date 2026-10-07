from collections import Counter
from pathlib import Path
import re

from knowledgellm.documents import document_for_key


def test_each_department_has_two_originals_and_two_chinese_translations():
    samples = Path(__file__).parents[1] / "src/knowledgellm/sample_docs"
    assert len(list(samples.glob("*/*.md"))) == 12
    assert not list(samples.glob("*/*.pdf"))
    for department in ("finance", "operations", "people"):
        originals = [p for p in (samples / department).glob("*.md") if not p.stem.endswith("-ch")]
        assert len(originals) == 2
        for original in originals:
            translated = original.with_name(original.stem + "-ch.md")
            en = original.read_text()
            zh = translated.read_text()
            assert "fictional sample" in en.lower()
            assert "虛構範例" in zh
            assert re.search(r"[\u4e00-\u9fff]", zh)
            assert document_for_key(str(original.relative_to(samples))).id == document_for_key(str(translated.relative_to(samples))).id
            # All numeric thresholds, amounts, durations, times and section numbers remain unchanged.
            assert Counter(re.findall(r"\d+(?:[.,:]\d+)*", re.sub(r"Q[1-4]", "", en))) == Counter(re.findall(r"\d+(?:[.,:]\d+)*", zh)), original.name
