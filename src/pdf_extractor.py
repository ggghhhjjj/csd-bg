"""Extract structured free-float rows from CSD-BG PDF bytes."""

from __future__ import annotations

import logging
import re
from io import BytesIO
from typing import Any, Dict, List

import pdfplumber


logger = logging.getLogger(__name__)


class PdfExtractorError(Exception):
    """Raised when PDF extraction fails."""

    pass


class PdfExtractor:
    """
    Parse Free Float PDF tables into structured rows.

    Each row is anchored by a Bulgarian ISIN (`BG` + 10 alphanumerics).
    Wrapped issuer names on following lines are joined onto the prior row.
    """

    ISIN_PATTERN = re.compile(r"BG[A-Z0-9]{10}")
    ROW_PATTERN = re.compile(
        r"^(?P<name>.+?)\s+"
        r"(?P<isin>BG[A-Z0-9]{10})\s+"
        r"(?P<total_shares>\d+)\s+"
        r"(?P<free_float>\d+)\s+"
        r"(?P<shareholders>\d+)\s*$"
    )
    SKIP_PATTERN = re.compile(
        r"Страница|Емитент|Фрий\s*фл|Брой\s*емитенти|дата\s*:",
        re.IGNORECASE,
    )

    def extract(self, pdf_bytes: bytes) -> List[Dict[str, Any]]:
        """
        Extract free-float rows from PDF bytes.

        Args:
            pdf_bytes: Raw PDF content

        Returns:
            List of dicts with keys:
            isin, issuer_name, total_shares, free_float, shareholders

        Raises:
            PdfExtractorError: If the PDF cannot be parsed or yields no rows
        """
        if not pdf_bytes:
            raise PdfExtractorError("PDF content is empty")

        try:
            text = self._extract_text(pdf_bytes)
        except Exception as e:  # pdfplumber can raise various errors
            raise PdfExtractorError(f"Failed to open PDF: {e}") from e

        rows = self._parse_text(text)
        if not rows:
            raise PdfExtractorError("No free-float rows found in PDF")

        logger.info("Extracted %s free-float rows from PDF", len(rows))
        if len(rows) < 50:
            logger.warning(
                "Extracted only %s rows; PDF may be incomplete or layout changed",
                len(rows),
            )
        return rows

    def _extract_text(self, pdf_bytes: bytes) -> str:
        """Return concatenated page text via pdfplumber."""
        pages_text: List[str] = []
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            if not pdf.pages:
                raise PdfExtractorError("PDF has no pages")
            for page in pdf.pages:
                pages_text.append(page.extract_text() or "")
        return "\n".join(pages_text)

    def _parse_text(self, text: str) -> List[Dict[str, Any]]:
        """Parse layout text into structured rows."""
        rows: List[Dict[str, Any]] = []

        for raw_line in text.splitlines():
            line = " ".join(raw_line.split())
            if not line or self.SKIP_PATTERN.search(line):
                continue

            match = self.ROW_PATTERN.match(line)
            if match:
                rows.append(
                    {
                        "issuer_name": match.group("name").strip(),
                        "isin": match.group("isin"),
                        "total_shares": int(match.group("total_shares")),
                        "free_float": int(match.group("free_float")),
                        "shareholders": int(match.group("shareholders")),
                    }
                )
                continue

            # Continuation of a wrapped issuer name (no ISIN on this line)
            if (
                rows
                and not self.ISIN_PATTERN.search(line)
                and re.search(r"[A-Za-zА-Яа-я\"“”]", line)
            ):
                rows[-1]["issuer_name"] = (f"{rows[-1]['issuer_name']} {line}").strip()
                rows[-1]["issuer_name"] = " ".join(rows[-1]["issuer_name"].split())

        return rows
