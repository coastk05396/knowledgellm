"""Render the editable fictional Markdown samples into searchable source PDFs."""
from pathlib import Path
import re
from xml.sax.saxutils import escape

from reportlab.lib.styles import getSampleStyleSheet
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer


def main() -> None:
    samples = Path(__file__).resolve().parents[1] / "api/src/knowledgellm/sample_docs"
    styles = getSampleStyleSheet()
    for source in sorted(samples.glob("*/*.md")):
        blocks = []
        for line in source.read_text().splitlines():
            if not line.strip():
                blocks.append(Spacer(1, 8))
                continue
            heading = re.match(r"^(#{1,3})\s+", line)
            style = styles[f"Heading{len(heading.group(1))}"] if heading else styles["BodyText"]
            text = re.sub(r"^#{1,3}\s+|^>\s+", "", line)
            text = text.replace("**", "").replace("`", "")
            blocks.append(Paragraph(escape(text), style))
        target = source.with_suffix(".pdf")
        SimpleDocTemplate(str(target), title=source.stem, author="KnowledgeLLM", invariant=1).build(blocks)
        print(target.relative_to(samples))


if __name__ == "__main__":
    main()
