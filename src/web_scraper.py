"""Web scraper module for extracting Free Float PDF links from CSD-BG website."""

from typing import List, Dict, Optional, Tuple
import re
from datetime import datetime
import requests
from bs4 import BeautifulSoup
import xml.etree.ElementTree as ET

from src.settings import base_url_from_statistics_url, resolve_statistics_url


class WebScraperError(Exception):
    """Custom exception for web scraping errors."""
    pass


class WebScraper:
    """
    Web scraper for extracting Free Float PDF links from CSD-BG website.
    
    This class handles fetching the web page and extracting relevant anchor tags
    containing Free Float PDF links.
    """

    HREF_PATTERN = "/ffloat/FREE_FLOAT"
    DATE_PATTERN = r"FREE_FLOAT_(\d{8})\.pdf"
    HTML_PARSER = "html.parser"
    FORM_ID = "formFF:j_idt46"
    FORM_NAME = "formFF"

    def __init__(self, timeout: int = 30, statistics_url: Optional[str] = None):
        """
        Initialize the WebScraper.

        Args:
            timeout: Request timeout in seconds (default: 30)
            statistics_url: Full member statistics page URL; defaults to
                CSD_BG_STATISTICS_URL from the environment.
        """
        self.statistics_url = resolve_statistics_url(statistics_url)
        self.base_url = base_url_from_statistics_url(self.statistics_url)
        self.timeout = timeout
        self.session = requests.Session()
        # Set basic headers for the session (cookies will be preserved)
        self.session.headers.update({
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0.1 Safari/605.1.15',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
        })

    def fetch_page(self, url: str = None) -> str:
        """
        Fetch the HTML content of a web page.
        
        Args:
            url: URL to fetch (defaults to statistics_url)
            
        Returns:
            HTML content as string
            
        Raises:
            WebScraperError: If fetching fails
        """
        target = url or self.statistics_url
        
        try:
            response = self.session.get(target, timeout=self.timeout)
            response.raise_for_status()
            return response.text
        except requests.exceptions.RequestException as e:
            raise WebScraperError(f"Failed to fetch page {target}: {str(e)}") from e

    def extract_free_float_links(self, html_content: str) -> List[Dict[str, str]]:
        """
        Extract Free Float PDF links from HTML content.
        
        Args:
            html_content: HTML content to parse
            
        Returns:
            List of dictionaries containing 'date', 'url', and 'href' keys
            
        Example:
            [
                {
                    'date': '2025-12-04',
                    'url': 'https://example.test/ffloat/FREE_FLOAT_20251204.pdf',
                    'href': '/ffloat/FREE_FLOAT_20251204.pdf'
                }
            ]
        """
        soup = BeautifulSoup(html_content, self.HTML_PARSER)
        links = []

        # Find all anchor tags with href containing the pattern
        anchors = soup.find_all('a', href=re.compile(self.HREF_PATTERN))

        for anchor in anchors:
            href = anchor.get('href', '')
            
            # Extract date from href
            match = re.search(self.DATE_PATTERN, href)
            if match:
                date_str = match.group(1)
                try:
                    # Convert YYYYMMDD to YYYY-MM-DD
                    date_obj = datetime.strptime(date_str, '%Y%m%d')
                    formatted_date = date_obj.strftime('%Y-%m-%d')
                    
                    # Generate full URL
                    full_url = f"{self.base_url}{href}"
                    
                    links.append({
                        'date': formatted_date,
                        'url': full_url,
                        'href': href
                    })
                except ValueError:
                    # Skip if date parsing fails
                    continue

        return links

    def scrape(self) -> List[Dict[str, str]]:
        """
        Perform the complete scraping operation.
        
        Returns:
            List of extracted Free Float links with dates
            
        Raises:
            WebScraperError: If scraping fails
        """
        html_content = self.fetch_page()
        return self.extract_free_float_links(html_content)

    def extract_form_params(self, html_content: str) -> Tuple[str, str]:
        """
        Extract ViewState and nonce from the initial page HTML.
        
        Args:
            html_content: HTML content from initial page
            
        Returns:
            Tuple of (view_state, nonce)
            
        Raises:
            WebScraperError: If extraction fails
        """
        soup = BeautifulSoup(html_content, self.HTML_PARSER)
        
        # Extract ViewState
        view_state_input = soup.find('input', {'name': 'javax.faces.ViewState'})
        if not view_state_input:
            raise WebScraperError("Failed to extract ViewState from page")
        view_state = view_state_input.get('value', '')
        
        # Extract nonce from script tag
        nonce = None
        scripts = soup.find_all('script', nonce=True)
        if scripts:
            nonce = scripts[0].get('nonce', '')
        
        if not nonce:
            raise WebScraperError("Failed to extract nonce from page")
            
        return view_state, nonce

    def _extract_links_from_html(self, html_content: str) -> List[Dict[str, str]]:
        """
        Helper method to extract links from HTML content.
        
        Args:
            html_content: HTML content to parse
            
        Returns:
            List of extracted links
        """
        links = []
        html_soup = BeautifulSoup(html_content, self.HTML_PARSER)
        anchors = html_soup.find_all('a', href=re.compile(self.HREF_PATTERN))
        
        for anchor in anchors:
            href = anchor.get('href', '')
            match = re.search(self.DATE_PATTERN, href)
            if match:
                date_str = match.group(1)
                try:
                    date_obj = datetime.strptime(date_str, '%Y%m%d')
                    formatted_date = date_obj.strftime('%Y-%m-%d')
                    full_url = f"{self.base_url}{href}"
                    
                    links.append({
                        'date': formatted_date,
                        'url': full_url,
                        'href': href
                    })
                except ValueError:
                    continue
        
        return links

    def parse_ajax_response(self, xml_content: str) -> Tuple[List[Dict[str, str]], Optional[str]]:
        """
        Parse AJAX XML response to extract Free Float links and updated ViewState.
        
        Args:
            xml_content: XML response from pagination request
            
        Returns:
            Tuple of (list of links, updated ViewState or None)
        """
        links = []
        updated_view_state = None
        
        try:
            # Parse XML response
            root = ET.fromstring(xml_content)
            
            # Extract links from CDATA section
            for update in root.findall('.//update'):
                update_id = update.get('id', '')
                
                # Process data update
                if 'j_idt46' in update_id and 'ViewState' not in update_id:
                    cdata_content = update.text or ''
                    links.extend(self._extract_links_from_html(cdata_content))
                
                # Extract updated ViewState
                elif 'ViewState' in update_id:
                    updated_view_state = (update.text or '').strip()
                    
        except ET.ParseError as e:
            raise WebScraperError(f"Failed to parse XML response: {str(e)}") from e
            
        return links, updated_view_state

    def fetch_paginated_data(self, page_number: int, view_state: str, nonce: str, 
                            rows_per_page: int = 10) -> Tuple[List[Dict[str, str]], Optional[str]]:
        """
        Fetch a specific page using POST request.
        
        Args:
            page_number: Page number (1-indexed)
            view_state: Current ViewState value
            nonce: Current nonce value
            rows_per_page: Number of rows per page (default: 10)
            
        Returns:
            Tuple of (list of links from this page, updated ViewState)
            
        Raises:
            WebScraperError: If request fails
        """
        # Calculate first record index (0-indexed)
        first_index = (page_number - 1) * rows_per_page
        
        # Build POST data
        post_data = {
            'javax.faces.partial.ajax': 'true',
            'javax.faces.source': self.FORM_ID,
            'javax.faces.partial.execute': self.FORM_ID,
            'javax.faces.partial.render': self.FORM_ID,
            f'{self.FORM_ID}_pagination': 'true',
            f'{self.FORM_ID}_first': str(first_index),
            f'{self.FORM_ID}_rows': str(rows_per_page),
            self.FORM_NAME: self.FORM_NAME,
            self.FORM_ID: 'list',
            f'{self.FORM_NAME}:j_idt44_collapsed': 'false',
            'javax.faces.ViewState': view_state,
            'primefaces.nonce': nonce
        }
        
        # Add AJAX headers for pagination POST request
        ajax_headers = {
            'Accept': 'application/xml, text/xml, */*; q=0.01',
            'X-Requested-With': 'XMLHttpRequest',
            'Faces-Request': 'partial/ajax',
        }
        
        try:
            response = self.session.post(
                self.statistics_url,
                data=post_data,
                headers=ajax_headers,
                timeout=self.timeout
            )
            response.raise_for_status()
            
            # Parse response
            return self.parse_ajax_response(response.text)
            
        except requests.exceptions.RequestException as e:
            raise WebScraperError(f"Failed to fetch page {page_number}: {str(e)}") from e

    def scrape_with_post_pagination(self, max_pages: Optional[int] = None) -> List[Dict[str, str]]:
        """
        Scrape all pages using POST-based pagination.
        
        This method uses AJAX POST requests to navigate through all pages,
        which is more efficient than Selenium-based pagination.
        
        Args:
            max_pages: Maximum number of pages to scrape (None for all pages)
            
        Returns:
            List of all Free Float links from all pages
            
        Raises:
            WebScraperError: If scraping fails
        """
        all_links = []
        
        # Fetch initial page to get ViewState and nonce
        html_content = self.fetch_page()
        view_state, nonce = self.extract_form_params(html_content)
        
        # Extract links from first page
        first_page_links = self.extract_free_float_links(html_content)
        all_links.extend(first_page_links)
        
        # Determine number of pages to scrape
        # For now, we'll continue until we get no links (empty page)
        page_number = 2
        empty_pages_count = 0
        max_empty_pages = 3  # Stop after 3 consecutive empty pages
        
        while True:
            # Check if we've reached max_pages limit
            if max_pages and page_number > max_pages:
                break
                
            try:
                # Fetch next page
                page_links, updated_view_state = self.fetch_paginated_data(
                    page_number, view_state, nonce
                )
                
                # Update ViewState if provided
                if updated_view_state:
                    view_state = updated_view_state
                
                # Check if page has links
                if not page_links:
                    empty_pages_count += 1
                    if empty_pages_count >= max_empty_pages:
                        # Stop after consecutive empty pages
                        break
                else:
                    empty_pages_count = 0
                    all_links.extend(page_links)
                
                page_number += 1
                
            except WebScraperError as e:
                # Log error but continue with what we have
                print(f"Warning: Error fetching page {page_number}: {str(e)}")
                break
        
        return all_links
