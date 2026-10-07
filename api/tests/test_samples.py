from pathlib import Path


def test_each_department_has_two_synthetic_markdown_documents() -> None:
    samples = Path(__file__).parents[1] / "src" / "knowledgellm" / "sample_docs"

    assert {
        department.name: sorted(path.stem for path in department.glob("*.md"))
        for department in samples.iterdir()
        if department.is_dir()
    } == {
        "finance": ["expense-policy", "q4-budget-overview"],
        "operations": ["runbook-procedures", "service-handoff"],
        "people": ["employee-handbook", "leave-policy"],
    }
    assert all("fictional sample" in path.read_text().lower() for path in samples.glob("*/*.md"))


def test_each_catalogued_pdf_preserves_all_sample_source_text() -> None:
    from pypdf import PdfReader
    from knowledgellm.documents import document_for_key
    import re

    samples = Path(__file__).parents[1] / "src" / "knowledgellm" / "sample_docs"
    pdfs = list(samples.glob("*/*.pdf"))
    assert len(pdfs) == 6
    for pdf in pdfs:
        assert document_for_key(str(pdf.relative_to(samples))) is not None
        extracted = " ".join(page.extract_text() for page in PdfReader(pdf).pages)
        source = pdf.with_suffix(".md").read_text()
        source = re.sub(r"(?m)^#{1,3}\s+|^>\s+", "", source)
        source = source.replace("**", "").replace("`", "")
        assert " ".join(source.split()) == " ".join(extracted.split())
