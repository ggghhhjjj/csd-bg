export class ScraperConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ScraperConfigError";
  }
}

export class WebScraperError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WebScraperError";
  }
}

export class DatabaseManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DatabaseManagerError";
  }
}

export class CsvManagerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CsvManagerError";
  }
}

export class PdfDownloaderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfDownloaderError";
  }
}

export class PdfExtractorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PdfExtractorError";
  }
}

export class PipelineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PipelineError";
  }
}

export class VectorExporterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VectorExporterError";
  }
}
