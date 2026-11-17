import { Injectable, HttpException } from "@nestjs/common";
import { DatabaseService } from "../database/database.service";
import { ExportRepository, exportError } from "./export.repository";
import { StorageService, type DocumentFormat } from "./storage.service";
import { ResumeRenderer, TEMPLATE_VERSION } from "./resume-renderer";
@Injectable()
export class ExportsService {
  constructor(
    private readonly repository: ExportRepository,
    private readonly storage: StorageService,
    private readonly renderer: ResumeRenderer,
    private readonly database: DatabaseService,
  ) {}
  private async cleanup(id: string, token: string, includeReady = false) {
    for (const batch of await this.repository.tracked(id, includeReady)) {
      await this.repository.assertLease(id, token);
      await this.storage.remove(batch.docxKey);
      await this.repository.assertLease(id, token);
      await this.storage.remove(batch.pdfKey);
      if (!includeReady) await this.repository.forget(batch.id);
    }
  }
  async generate(id: string) {
    this.storage.assertConfigured();
    const { token, application } = await this.repository.acquire(id);
    let published = false;
    try {
      // Remove tracked leftovers before another attempt; never overwrite active files.
      await this.cleanup(id, token);
      const batch = await this.repository.begin(id, token, TEMPLATE_VERSION);
      const files = await this.renderer.render(application.resume);
      await this.repository.assertLease(id, token);
      await this.storage.upload(batch.docxKey, files.docx, "docx");
      await this.repository.assertLease(id, token);
      await this.storage.upload(batch.pdfKey, files.pdf, "pdf");
      await this.repository.publish(id, token, batch.id, TEMPLATE_VERSION);
      published = true;
      // Ready files are immutable; obsolete batches stay registered if cleanup fails.
      try {
        await this.cleanup(id, token);
      } catch {
        /* Retried on regeneration or delete. */
      }
      return await this.database.getApplication(id);
    } catch (error) {
      if (!published) {
        try {
          await this.cleanup(id, token);
        } catch {
          /* Manifest retains leftovers for retry. */
        }
        await this.repository.fail(id, token);
      }
      if (error instanceof HttpException) throw error;
      throw exportError(
        "DOCUMENT_GENERATION_FAILED",
        "Could not finish generating and storing the documents. Your saved resume is unchanged. You can retry without another AI call.",
      );
    } finally {
      await this.repository.release(id, token);
    }
  }
  async download(id: string, format: DocumentFormat) {
    const batch = await this.repository.ready(id);
    try {
      return await this.storage.download(
        format === "pdf" ? batch.pdfKey : batch.docxKey,
        format,
      );
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw exportError(
        "DOCUMENT_DOWNLOAD_UNAVAILABLE",
        "The stored document could not be reached. Check storage or regenerate the files from this saved resume.",
      );
    }
  }
  async remove(id: string) {
    const { token } = await this.repository.acquire(id, true);
    try {
      const batches = await this.repository.tracked(id, true);
      if (batches.length) this.storage.assertConfigured();
      await this.cleanup(id, token, true);
      await this.repository.finishDelete(id, token);
      return { deleted: true };
    } catch (error) {
      await this.repository.fail(id, token, true);
      if (error instanceof HttpException) throw error;
      throw exportError(
        "APPLICATION_DELETE_FAILED",
        "Some files could not be removed. The history record is kept so you can retry Delete.",
      );
    } finally {
      await this.repository.release(id, token);
    }
  }
}
