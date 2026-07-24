"""PDF downloader with retries and random backoff."""

import logging
import random
import time
from typing import Optional

import requests


logger = logging.getLogger(__name__)


class PdfDownloaderError(Exception):
    """Custom exception for PDF download failures."""

    pass


class PdfDownloader:
    """
    Download Free Float PDF files over HTTP.

    Retries transient/network/HTTP failures with a random sleep between attempts.
    """

    PDF_MAGIC = b"%PDF"

    def __init__(
        self,
        timeout: int = 30,
        max_retries: int = 3,
        retry_min_seconds: int = 10,
        retry_max_seconds: int = 30,
        session: Optional[requests.Session] = None,
    ):
        """
        Initialize the PdfDownloader.

        Args:
            timeout: HTTP request timeout in seconds
            max_retries: Maximum download attempts per URL (default: 3)
            retry_min_seconds: Minimum backoff seconds between attempts
            retry_max_seconds: Maximum backoff seconds between attempts
            session: Optional shared requests session
        """
        if max_retries < 1:
            raise ValueError("max_retries must be at least 1")
        if retry_min_seconds < 0 or retry_max_seconds < 0:
            raise ValueError("retry delay bounds must be non-negative")
        if retry_min_seconds > retry_max_seconds:
            raise ValueError("retry_min_seconds cannot exceed retry_max_seconds")

        self.timeout = timeout
        self.max_retries = max_retries
        self.retry_min_seconds = retry_min_seconds
        self.retry_max_seconds = retry_max_seconds
        self.session = session or requests.Session()
        self.last_attempts = 0
        if session is None:
            self.session.headers.update(
                {
                    "User-Agent": (
                        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
                        "AppleWebKit/605.1.15 (KHTML, like Gecko) "
                        "Version/26.0.1 Safari/605.1.15"
                    ),
                    "Accept": "application/pdf,*/*",
                }
            )

    def _backoff_seconds(self) -> float:
        """Return a random delay in [retry_min_seconds, retry_max_seconds]."""
        return random.uniform(self.retry_min_seconds, self.retry_max_seconds)

    def _validate_pdf_bytes(self, content: bytes, content_type: Optional[str]) -> None:
        """
        Validate that response body looks like a PDF.

        Raises:
            PdfDownloaderError: If content is empty or not a PDF
        """
        if not content:
            raise PdfDownloaderError("Downloaded content is empty")

        content_type_lower = (content_type or "").lower()
        looks_like_pdf_type = "pdf" in content_type_lower if content_type_lower else False
        has_magic = content.startswith(self.PDF_MAGIC)

        if not has_magic and not looks_like_pdf_type:
            raise PdfDownloaderError(
                "Downloaded content is not a PDF "
                f"(content-type={content_type!r}, magic={content[:8]!r})"
            )
        if not has_magic:
            raise PdfDownloaderError(
                f"Downloaded content missing PDF magic header (content-type={content_type!r})"
            )

    def _download_once(self, url: str) -> bytes:
        """
        Perform a single HTTP GET and return PDF bytes.

        Raises:
            PdfDownloaderError: On HTTP, network, or validation failure
        """
        try:
            response = self.session.get(url, timeout=self.timeout)
            response.raise_for_status()
        except requests.exceptions.RequestException as e:
            raise PdfDownloaderError(f"Failed to download {url}: {str(e)}") from e

        content_type = response.headers.get("Content-Type")
        content = response.content
        self._validate_pdf_bytes(content, content_type)
        return content

    def download(self, url: str) -> bytes:
        """
        Download a PDF with retries and random backoff between failures.

        Args:
            url: Absolute URL of the PDF

        Returns:
            PDF file contents as bytes

        Raises:
            PdfDownloaderError: If all attempts fail
        """
        last_error: Optional[Exception] = None
        self.last_attempts = 0

        for attempt in range(1, self.max_retries + 1):
            self.last_attempts = attempt
            try:
                logger.info(
                    "Downloading PDF (attempt %s/%s): %s",
                    attempt,
                    self.max_retries,
                    url,
                )
                content = self._download_once(url)
                logger.info("Downloaded %s bytes from %s", len(content), url)
                return content
            except PdfDownloaderError as e:
                last_error = e
                logger.warning(
                    "PDF download attempt %s/%s failed for %s: %s",
                    attempt,
                    self.max_retries,
                    url,
                    e,
                )
                if attempt < self.max_retries:
                    delay = self._backoff_seconds()
                    logger.info("Retrying PDF download after %.1fs", delay)
                    time.sleep(delay)

        raise PdfDownloaderError(
            f"Failed to download {url} after {self.max_retries} attempts: {last_error}"
        ) from last_error
