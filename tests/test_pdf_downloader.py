"""Tests for PdfDownloader."""

from unittest.mock import Mock, patch

import pytest
import requests

from src.pdf_downloader import PdfDownloader, PdfDownloaderError


FAKE_PDF = b"%PDF-1.4 fake content"


class TestPdfDownloader:
    """Test suite for PdfDownloader."""

    def test_init_rejects_invalid_retries(self):
        with pytest.raises(ValueError):
            PdfDownloader(max_retries=0)

    def test_init_rejects_invalid_delay_bounds(self):
        with pytest.raises(ValueError):
            PdfDownloader(retry_min_seconds=30, retry_max_seconds=10)

    def test_download_success(self):
        session = Mock()
        response = Mock()
        response.content = FAKE_PDF
        response.headers = {"Content-Type": "application/pdf"}
        response.raise_for_status = Mock()
        session.get.return_value = response

        downloader = PdfDownloader(session=session, max_retries=3)
        content = downloader.download("https://example.com/file.pdf")

        assert content == FAKE_PDF
        assert downloader.last_attempts == 1
        session.get.assert_called_once()

    @patch("src.pdf_downloader.time.sleep")
    def test_download_retries_then_success(self, mock_sleep):
        session = Mock()
        fail_response = Mock()
        fail_response.raise_for_status.side_effect = requests.exceptions.HTTPError("404")
        ok_response = Mock()
        ok_response.content = FAKE_PDF
        ok_response.headers = {"Content-Type": "application/pdf"}
        ok_response.raise_for_status = Mock()
        session.get.side_effect = [fail_response, ok_response]

        downloader = PdfDownloader(
            session=session,
            max_retries=3,
            retry_min_seconds=10,
            retry_max_seconds=30,
        )
        with patch("src.pdf_downloader.random.uniform", return_value=12.5):
            content = downloader.download("https://example.com/file.pdf")

        assert content == FAKE_PDF
        assert downloader.last_attempts == 2
        assert session.get.call_count == 2
        mock_sleep.assert_called_once_with(12.5)

    @patch("src.pdf_downloader.time.sleep")
    def test_download_exhausts_retries_on_404(self, mock_sleep):
        session = Mock()
        fail_response = Mock()
        fail_response.raise_for_status.side_effect = requests.exceptions.HTTPError(
            "404 Client Error"
        )
        session.get.return_value = fail_response

        downloader = PdfDownloader(
            session=session,
            max_retries=3,
            retry_min_seconds=10,
            retry_max_seconds=10,
        )

        with pytest.raises(PdfDownloaderError) as excinfo:
            downloader.download("https://example.com/missing.pdf")

        assert "after 3 attempts" in str(excinfo.value)
        assert session.get.call_count == 3
        assert mock_sleep.call_count == 2
        assert downloader.last_attempts == 3

    def test_download_rejects_non_pdf_bytes(self):
        session = Mock()
        response = Mock()
        response.content = b"<html>not a pdf</html>"
        response.headers = {"Content-Type": "text/html"}
        response.raise_for_status = Mock()
        session.get.return_value = response

        downloader = PdfDownloader(session=session, max_retries=1)

        with pytest.raises(PdfDownloaderError) as excinfo:
            downloader.download("https://example.com/file.pdf")

        assert "not a PDF" in str(excinfo.value) or "magic" in str(excinfo.value).lower()

    @patch("src.pdf_downloader.time.sleep")
    def test_download_network_error_retries(self, mock_sleep):
        session = Mock()
        session.get.side_effect = requests.exceptions.ConnectionError("network down")

        downloader = PdfDownloader(
            session=session, max_retries=2, retry_min_seconds=1, retry_max_seconds=1
        )

        with pytest.raises(PdfDownloaderError):
            downloader.download("https://example.com/file.pdf")

        assert session.get.call_count == 2
        mock_sleep.assert_called_once()
