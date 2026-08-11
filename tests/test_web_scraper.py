"""Tests for the WebScraper class."""

import pytest
from unittest.mock import Mock, patch
from pathlib import Path
from src.web_scraper import WebScraper, WebScraperError
from tests.conftest import TEST_BASE_URL, TEST_STATISTICS_URL


class TestWebScraper:
    """Test suite for WebScraper class."""

    @pytest.fixture
    def scraper(self):
        """Create a WebScraper instance for testing."""
        return WebScraper(timeout=10)

    @pytest.fixture
    def sample_html(self):
        """Load real HTML content from fixture file."""
        fixture_path = Path(__file__).parent / "fixtures" / "csd_home.html"
        with open(fixture_path, 'r', encoding='utf-8') as f:
            return f.read()
    
    @pytest.fixture
    def simple_html(self):
        """Simple HTML for basic testing."""
        return """
        <html>
            <body>
                <a class="center-panel-right-13" href="/ffloat/FREE_FLOAT_20251204.pdf" target="_blank">
                    Free Float за 2025-12-04
                </a>
                <a class="center-panel-right-13" href="/ffloat/FREE_FLOAT_20251203.pdf" target="_blank">
                    Free Float за 2025-12-03
                </a>
                <a href="/other/document.pdf">Other Document</a>
                <a href="/ffloat/FREE_FLOAT_invalid.pdf">Invalid Date</a>
            </body>
        </html>
        """

    def test_initialization(self, scraper):
        """Test WebScraper initialization."""
        assert scraper.timeout == 10
        assert scraper.base_url == TEST_BASE_URL
        assert scraper.statistics_url == TEST_STATISTICS_URL

    def test_initialization_default_timeout(self):
        """Test WebScraper initialization with default timeout."""
        scraper = WebScraper()
        assert scraper.timeout == 30

    def test_fetch_page_success(self, scraper):
        """Test successful page fetching."""
        mock_response = Mock()
        mock_response.text = "<html>Test</html>"
        mock_response.raise_for_status = Mock()
        scraper.session.get = Mock(return_value=mock_response)

        result = scraper.fetch_page()

        assert result == "<html>Test</html>"
        scraper.session.get.assert_called_once_with(scraper.statistics_url, timeout=10)

    def test_fetch_page_with_custom_url(self, scraper):
        """Test fetching with custom URL."""
        mock_response = Mock()
        mock_response.text = "<html>Custom</html>"
        mock_response.raise_for_status = Mock()
        scraper.session.get = Mock(return_value=mock_response)

        custom_url = "https://example.com/test"
        result = scraper.fetch_page(custom_url)

        assert result == "<html>Custom</html>"
        scraper.session.get.assert_called_once_with(custom_url, timeout=10)

    def test_fetch_page_request_exception(self, scraper):
        """Test fetch_page handling of request exceptions."""
        import requests
        scraper.session.get = Mock(side_effect=requests.exceptions.RequestException("Network error"))

        with pytest.raises(WebScraperError) as excinfo:
            scraper.fetch_page()

        assert "Failed to fetch page" in str(excinfo.value)
        assert "Network error" in str(excinfo.value)

    def test_extract_free_float_links(self, scraper, simple_html):
        """Test extraction of Free Float links from simple HTML."""
        links = scraper.extract_free_float_links(simple_html)

        assert len(links) == 2
        
        # Check first link
        assert links[0]['date'] == '2025-12-04'
        assert links[0]['url'] == f'{TEST_BASE_URL}/ffloat/FREE_FLOAT_20251204.pdf'
        assert links[0]['href'] == '/ffloat/FREE_FLOAT_20251204.pdf'
        
        # Check second link
        assert links[1]['date'] == '2025-12-03'
        assert links[1]['url'] == f'{TEST_BASE_URL}/ffloat/FREE_FLOAT_20251203.pdf'
        assert links[1]['href'] == '/ffloat/FREE_FLOAT_20251203.pdf'
    
    def test_extract_free_float_links_real_html(self, scraper, sample_html):
        """Test extraction using real CSD-BG HTML fixture."""
        links = scraper.extract_free_float_links(sample_html)

        # Real fixture has 10 Free Float links
        assert len(links) >= 10
        
        # Verify first link (most recent)
        assert links[0]['date'] == '2025-12-04'
        assert links[0]['url'] == f'{TEST_BASE_URL}/ffloat/FREE_FLOAT_20251204.pdf'
        
        # Verify dates are in descending order
        dates = [link['date'] for link in links]
        assert dates == sorted(dates, reverse=True)
        
        # Verify all links have required fields
        for link in links:
            assert 'date' in link
            assert 'url' in link
            assert 'href' in link
            assert link['url'].startswith(f'{TEST_BASE_URL}/ffloat/')
            assert link['href'].startswith('/ffloat/FREE_FLOAT_')

    def test_extract_free_float_links_empty_html(self, scraper):
        """Test extraction from empty HTML."""
        links = scraper.extract_free_float_links("<html><body></body></html>")
        assert len(links) == 0

    def test_extract_free_float_links_no_matching_anchors(self, scraper):
        """Test extraction with no matching anchors."""
        html = """
        <html>
            <body>
                <a href="/other/document.pdf">Other Document</a>
                <a href="/another/link.html">Another Link</a>
            </body>
        </html>
        """
        links = scraper.extract_free_float_links(html)
        assert len(links) == 0

    def test_extract_free_float_links_invalid_date_format(self, scraper):
        """Test extraction skips links with invalid date format."""
        html = """
        <html>
            <body>
                <a href="/ffloat/FREE_FLOAT_invalid.pdf">Invalid</a>
                <a href="/ffloat/FREE_FLOAT_2025.pdf">Incomplete</a>
            </body>
        </html>
        """
        links = scraper.extract_free_float_links(html)
        assert len(links) == 0

    def test_date_conversion(self, scraper):
        """Test date conversion from YYYYMMDD to YYYY-MM-DD."""
        html = '<a href="/ffloat/FREE_FLOAT_20251231.pdf">Test</a>'
        links = scraper.extract_free_float_links(html)
        
        assert len(links) == 1
        assert links[0]['date'] == '2025-12-31'

    @patch.object(WebScraper, 'fetch_page')
    @patch.object(WebScraper, 'extract_free_float_links')
    def test_scrape_integration(self, mock_extract, mock_fetch, scraper):
        """Test the complete scrape method."""
        mock_fetch.return_value = "<html>Test</html>"
        mock_extract.return_value = [
            {
                'date': '2025-12-04',
                'url': f'{TEST_BASE_URL}/ffloat/FREE_FLOAT_20251204.pdf',
                'href': '/ffloat/FREE_FLOAT_20251204.pdf'
            }
        ]

        result = scraper.scrape()

        mock_fetch.assert_called_once()
        mock_extract.assert_called_once_with("<html>Test</html>")
        assert len(result) == 1
        assert result[0]['date'] == '2025-12-04'

    @patch.object(WebScraper, 'fetch_page')
    def test_scrape_handles_fetch_error(self, mock_fetch, scraper):
        """Test scrape method handles fetch errors."""
        mock_fetch.side_effect = WebScraperError("Network error")

        with pytest.raises(WebScraperError):
            scraper.scrape()

    @pytest.fixture
    def sample_html_with_viewstate(self):
        """Sample HTML with ViewState and nonce."""
        return """
        <html>
            <head>
                <script nonce="MzQwOGQ0MjYtOWNkOC00YmQ5LTg1YWMtZTA2ZGNjNDgyZjQ5"></script>
            </head>
            <body>
                <form>
                    <input type="hidden" name="javax.faces.ViewState" 
                           value="-2187822647981327038:2544928799145319437" />
                </form>
            </body>
        </html>
        """

    @pytest.fixture
    def sample_ajax_response(self):
        """Sample AJAX XML response."""
        return """<?xml version='1.0' encoding='UTF-8'?>
<partial-response id="j_id1">
    <changes>
        <update id="formFF:j_idt46">
            <![CDATA[<ul class="ui-dataview-list-container">
            <li class="ui-dataview-row">
                <i class="pi pi-file-o" style="color: #048282;">
                    <a class="center-panel-right-13" href="/ffloat/FREE_FLOAT_20251205.pdf" target="_blank">
                        Free Float за 2025-12-05
                    </a>
                </i>
            </li>
            <li class="ui-dataview-row">
                <i class="pi pi-file-o" style="color: #048282;">
                    <a class="center-panel-right-13" href="/ffloat/FREE_FLOAT_20251204.pdf" target="_blank">
                        Free Float за 2025-12-04
                    </a>
                </i>
            </li>
            </ul>]]>
        </update>
        <update id="j_id1:javax.faces.ViewState:0">
            <![CDATA[-2187822647981327038:9999999999999999999]]>
        </update>
    </changes>
</partial-response>"""

    def test_extract_form_params(self, scraper, sample_html_with_viewstate):
        """Test extraction of ViewState and nonce from HTML."""
        view_state, nonce = scraper.extract_form_params(sample_html_with_viewstate)
        
        assert view_state == "-2187822647981327038:2544928799145319437"
        assert nonce == "MzQwOGQ0MjYtOWNkOC00YmQ5LTg1YWMtZTA2ZGNjNDgyZjQ5"

    def test_extract_form_params_missing_viewstate(self, scraper):
        """Test error when ViewState is missing."""
        html = "<html><body>No ViewState here</body></html>"
        
        with pytest.raises(WebScraperError) as excinfo:
            scraper.extract_form_params(html)
        
        assert "Failed to extract ViewState" in str(excinfo.value)

    def test_extract_form_params_missing_nonce(self, scraper):
        """Test error when nonce is missing."""
        html = """
        <html>
            <body>
                <input type="hidden" name="javax.faces.ViewState" value="test123" />
            </body>
        </html>
        """
        
        with pytest.raises(WebScraperError) as excinfo:
            scraper.extract_form_params(html)
        
        assert "Failed to extract nonce" in str(excinfo.value)

    def test_parse_ajax_response(self, scraper, sample_ajax_response):
        """Test parsing of AJAX XML response."""
        links, view_state = scraper.parse_ajax_response(sample_ajax_response)
        
        assert len(links) == 2
        assert links[0]['date'] == '2025-12-05'
        assert links[0]['url'] == f'{TEST_BASE_URL}/ffloat/FREE_FLOAT_20251205.pdf'
        assert links[1]['date'] == '2025-12-04'
        assert view_state.strip() == "-2187822647981327038:9999999999999999999"

    def test_parse_ajax_response_empty(self, scraper):
        """Test parsing empty AJAX response."""
        xml = """<?xml version='1.0' encoding='UTF-8'?>
<partial-response id="j_id1">
    <changes>
        <update id="formFF:j_idt46">
            <![CDATA[<ul class="ui-dataview-list-container"></ul>]]>
        </update>
    </changes>
</partial-response>"""
        
        links, view_state = scraper.parse_ajax_response(xml)
        
        assert len(links) == 0
        assert view_state is None

    def test_parse_ajax_response_invalid_xml(self, scraper):
        """Test error handling for invalid XML."""
        with pytest.raises(WebScraperError) as excinfo:
            scraper.parse_ajax_response("<invalid>xml")
        
        assert "Failed to parse XML response" in str(excinfo.value)

    def test_fetch_paginated_data(self, scraper, sample_ajax_response):
        """Test fetching a specific page with POST request."""
        mock_response = Mock()
        mock_response.text = sample_ajax_response
        mock_response.raise_for_status = Mock()
        
        # Mock the session.post method on the instance
        with patch.object(scraper.session, 'post', return_value=mock_response) as mock_post:
            view_state = "-2187822647981327038:2544928799145319437"
            nonce = "MzQwOGQ0MjYtOWNkOC00YmQ5LTg1YWMtZTA2ZGNjNDgyZjQ5"
            
            links, updated_view_state = scraper.fetch_paginated_data(2, view_state, nonce)
            
            assert len(links) == 2
            assert links[0]['date'] == '2025-12-05'
            assert updated_view_state.strip() == "-2187822647981327038:9999999999999999999"
            
            # Verify POST was called with correct data
            mock_post.assert_called_once()
            call_args = mock_post.call_args
            post_data = call_args[1]['data']
            
            assert post_data['formFF:j_idt46_first'] == '10'  # Page 2 starts at index 10
            assert post_data['formFF:j_idt46_rows'] == '10'
            assert post_data['javax.faces.ViewState'] == view_state
            assert post_data['primefaces.nonce'] == nonce

    def test_fetch_paginated_data_request_error(self, scraper):
        """Test error handling in fetch_paginated_data."""
        import requests
        
        # Mock the session.post method on the instance
        with patch.object(scraper.session, 'post', side_effect=requests.exceptions.RequestException("Network error")):
            with pytest.raises(WebScraperError) as excinfo:
                scraper.fetch_paginated_data(2, "view_state", "nonce")
            
            assert "Failed to fetch page 2" in str(excinfo.value)

    @patch.object(WebScraper, 'fetch_paginated_data')
    @patch.object(WebScraper, 'extract_form_params')
    @patch.object(WebScraper, 'fetch_page')
    @patch.object(WebScraper, 'extract_free_float_links')
    def test_scrape_with_post_pagination(self, mock_extract, mock_fetch, 
                                        mock_extract_params, mock_fetch_paginated, scraper):
        """Test complete pagination scraping."""
        # Setup mocks
        mock_fetch.return_value = "<html>initial</html>"
        mock_extract_params.return_value = ("view_state", "nonce")
        mock_extract.return_value = [
            {'date': '2025-12-05', 'url': f'{TEST_BASE_URL}/ffloat/FREE_FLOAT_20251205.pdf', 'href': '/ffloat/FREE_FLOAT_20251205.pdf'}
        ]
        
        # Mock paginated responses - page 2 has data, page 3 is empty
        mock_fetch_paginated.side_effect = [
            ([{'date': '2025-12-04', 'url': f'{TEST_BASE_URL}/ffloat/FREE_FLOAT_20251204.pdf', 'href': '/ffloat/FREE_FLOAT_20251204.pdf'}], "new_view_state"),
            ([], None),  # Empty page triggers stop
            ([], None),
            ([], None),
        ]
        
        result = scraper.scrape_with_post_pagination(max_pages=5)
        
        assert len(result) == 2
        assert result[0]['date'] == '2025-12-05'
        assert result[1]['date'] == '2025-12-04'

    @patch.object(WebScraper, 'fetch_paginated_data')
    @patch.object(WebScraper, 'extract_form_params')
    @patch.object(WebScraper, 'fetch_page')
    @patch.object(WebScraper, 'extract_free_float_links')
    def test_scrape_with_post_pagination_max_pages(self, mock_extract, mock_fetch,
                                                   mock_extract_params, mock_fetch_paginated, scraper):
        """Test pagination with max_pages limit."""
        mock_fetch.return_value = "<html>initial</html>"
        mock_extract_params.return_value = ("view_state", "nonce")
        mock_extract.return_value = [{'date': '2025-12-05', 'url': 'url1', 'href': 'href1'}]
        mock_fetch_paginated.return_value = ([{'date': '2025-12-04', 'url': 'url2', 'href': 'href2'}], None)
        
        result = scraper.scrape_with_post_pagination(max_pages=2)
        
        assert len(result) == 2
        # Should only call fetch_paginated_data once for page 2
        assert mock_fetch_paginated.call_count == 1

    @patch.object(WebScraper, 'fetch_paginated_data')
    @patch.object(WebScraper, 'extract_form_params')
    @patch.object(WebScraper, 'fetch_page')
    @patch.object(WebScraper, 'extract_free_float_links')
    def test_scrape_with_post_pagination_handles_errors(self, mock_extract, mock_fetch,
                                                       mock_extract_params, mock_fetch_paginated, scraper):
        """Test pagination handles errors gracefully."""
        mock_fetch.return_value = "<html>initial</html>"
        mock_extract_params.return_value = ("view_state", "nonce")
        mock_extract.return_value = [{'date': '2025-12-05', 'url': 'url1', 'href': 'href1'}]
        
        # First page succeeds, second fails
        mock_fetch_paginated.side_effect = [
            ([{'date': '2025-12-04', 'url': 'url2', 'href': 'href2'}], None),
            WebScraperError("Network error")
        ]
        
        result = scraper.scrape_with_post_pagination()
        
        # Should return what was collected before error
        assert len(result) == 2

    def test_extract_links_from_html_helper(self, scraper, simple_html):
        """Test the helper method for extracting links."""
        links = scraper._extract_links_from_html(simple_html)
        
        assert len(links) == 2
        assert links[0]['date'] == '2025-12-04'
        assert links[1]['date'] == '2025-12-03'
