"""Tests for PdfExtractor, including golden comparison to markdown table."""

from __future__ import annotations

import re
from pathlib import Path
from typing import Any, Dict, List

import pytest

from src.pdf_extractor import PdfExtractor, PdfExtractorError


FIXTURES = Path(__file__).parent / "fixtures"
PDF_20260723 = FIXTURES / "FREE_FLOAT_20260723.pdf"
MD_20260723 = FIXTURES / "FREE_FLOAT_20260723.md"
PDF_20220104 = FIXTURES / "FREE_FLOAT_20220104.pdf"


def load_markdown_rows(path: Path) -> List[Dict[str, Any]]:
    """Parse golden markdown table into extractor-shaped row dicts."""
    rows: List[Dict[str, Any]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line.startswith("|"):
            continue
        if "Емитент" in line or re.match(r"^\|\s*-+", line):
            continue
        parts = [part.strip() for part in line.strip("|").split("|")]
        if len(parts) != 5:
            raise AssertionError(f"Unexpected markdown row: {line!r}")
        rows.append(
            {
                "issuer_name": parts[0],
                "isin": parts[1],
                "total_shares": int(parts[2]),
                "free_float": int(parts[3]),
                "shareholders": int(parts[4]),
            }
        )
    return rows


class TestPdfExtractor:
    """Test suite for PdfExtractor."""

    def test_empty_bytes_raises(self):
        with pytest.raises(PdfExtractorError):
            PdfExtractor().extract(b"")

    def test_invalid_pdf_raises(self):
        with pytest.raises(PdfExtractorError):
            PdfExtractor().extract(b"not a pdf")

    def test_golden_matches_markdown_20260723(self):
        """Extracted PDF rows must match FREE_FLOAT_20260723.md by ISIN."""
        assert PDF_20260723.exists(), f"Missing fixture {PDF_20260723}"
        assert MD_20260723.exists(), f"Missing fixture {MD_20260723}"

        expected = load_markdown_rows(MD_20260723)
        actual = PdfExtractor().extract(PDF_20260723.read_bytes())

        assert len(actual) == len(expected)

        expected_by_isin = {row["isin"]: row for row in expected}
        actual_by_isin = {row["isin"]: row for row in actual}
        assert set(actual_by_isin) == set(expected_by_isin)

        for isin, expected_row in expected_by_isin.items():
            actual_row = actual_by_isin[isin]
            assert actual_row["issuer_name"] == expected_row["issuer_name"], isin
            assert actual_row["total_shares"] == expected_row["total_shares"], isin
            assert actual_row["free_float"] == expected_row["free_float"], isin
            assert actual_row["shareholders"] == expected_row["shareholders"], isin

    def test_wrapped_issuer_name_joined(self):
        rows = PdfExtractor().extract(PDF_20260723.read_bytes())
        by_isin = {row["isin"]: row for row in rows}
        assert "BG1100008157" in by_isin
        assert "Имоти" in by_isin["BG1100008157"]["issuer_name"]

    def test_issuer_rename_same_isin_across_pdfs(self):
        """BG1100003166 is АЛТЕРКО АД in 2022 and ШЕЛЛИ ГРУП ЕД in 2026."""
        assert PDF_20220104.exists(), f"Missing fixture {PDF_20220104}"

        older = {row["isin"]: row for row in PdfExtractor().extract(PDF_20220104.read_bytes())}
        newer = {row["isin"]: row for row in PdfExtractor().extract(PDF_20260723.read_bytes())}

        isin = "BG1100003166"
        assert older[isin]["issuer_name"] == "АЛТЕРКО АД"
        assert newer[isin]["issuer_name"] == "ШЕЛЛИ ГРУП ЕД"
