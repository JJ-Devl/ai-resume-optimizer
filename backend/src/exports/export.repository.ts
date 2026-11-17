import { Injectable, HttpException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { DatabaseService } from "../database/database.service";
export const exportError = (code: string, message: string, status = 503) =>
  new HttpException({ code, message }, status);
@Injectable()
export class ExportRepository {
  constructor(private readonly database: DatabaseService) {}
  async acquire(id: string, deleting = false) {
    return this.database.prisma.$transaction(async (tx) => {
      const application = await tx.application.findUnique({ where: { id } });
      if (!application)
        throw exportError(
          "APPLICATION_NOT_FOUND",
          "This saved application was not found.",
          404,
        );
      if (
        !deleting &&
        ["deleting", "delete_failed"].includes(application.documentStatus)
      )
        throw exportError(
          "DELETE_PENDING",
          "Finish deleting this application before changing its documents.",
          409,
        );
      const token = randomUUID(),
        now = new Date();
      const lock = await tx.application.updateMany({
        where: {
          id,
          OR: [
            { documentLeaseUntil: null },
            { documentLeaseUntil: { lt: now } },
          ],
        },
        data: {
          documentToken: token,
          documentLeaseUntil: new Date(now.getTime() + 300000),
          documentStatus: deleting ? "deleting" : "generating",
          documentError: null,
        },
      });
      if (!lock.count)
        throw exportError(
          "DOCUMENTS_BUSY",
          "This application is already being changed. Try again after the current operation finishes.",
          409,
        );
      return { token, application };
    });
  }
  async assertLease(id: string, token: string) {
    if (
      !(await this.database.prisma.application.findFirst({
        where: {
          id,
          documentToken: token,
          documentLeaseUntil: { gt: new Date() },
        },
        select: { id: true },
      }))
    )
      throw exportError(
        "DOCUMENTS_BUSY",
        "This document operation expired. Reload History before retrying.",
        409,
      );
  }
  async release(id: string, token: string) {
    await this.database.prisma.application.updateMany({
      where: { id, documentToken: token },
      data: { documentToken: null, documentLeaseUntil: null },
    });
  }
  async tracked(id: string, includeReady = false) {
    return this.database.prisma.documentExport.findMany({
      where: {
        applicationId: id,
        ...(includeReady ? {} : { state: { not: "ready" } }),
      },
    });
  }
  async forget(id: string) {
    await this.database.prisma.documentExport.deleteMany({
      where: { id, state: { not: "ready" } },
    });
  }
  async begin(id: string, token: string, templateVersion: string) {
    await this.assertLease(id, token);
    const batch = randomUUID();
    return this.database.prisma.documentExport.create({
      data: {
        id: batch,
        applicationId: id,
        templateVersion,
        docxKey: "applications/" + id + "/" + batch + "/resume.docx",
        pdfKey: "applications/" + id + "/" + batch + "/resume.pdf",
      },
    });
  }
  async publish(
    id: string,
    token: string,
    batchId: string,
    templateVersion: string,
  ) {
    await this.database.prisma.$transaction(async (tx) => {
      const lock = await tx.application.updateMany({
        where: {
          id,
          documentToken: token,
          documentLeaseUntil: { gt: new Date() },
        },
        data: {
          documentStatus: "ready",
          documentError: null,
          documentsGeneratedAt: new Date(),
          templateVersion,
        },
      });
      if (!lock.count)
        throw exportError(
          "DOCUMENTS_BUSY",
          "Document operation expired before saving.",
          409,
        );
      await tx.documentExport.updateMany({
        where: { applicationId: id, state: "ready" },
        data: { state: "obsolete" },
      });
      await tx.documentExport.update({
        where: { id: batchId },
        data: { state: "ready" },
      });
    });
  }
  async fail(id: string, token: string, deleting = false) {
    const ready = await this.database.prisma.documentExport.findFirst({
      where: { applicationId: id, state: "ready" },
      select: { id: true },
    });
    await this.database.prisma.application.updateMany({
      where: { id, documentToken: token },
      data: {
        documentStatus: deleting ? "delete_failed" : ready ? "ready" : "failed",
        documentError: deleting
          ? "Deletion did not finish. Retry Delete to remove the remaining files and record."
          : "Document generation did not finish. Retry generation; your saved resume content is unchanged.",
      },
    });
  }
  async ready(id: string) {
    const app = await this.database.prisma.application.findUnique({
      where: { id },
      select: { documentStatus: true },
    });
    if (!app)
      throw exportError(
        "APPLICATION_NOT_FOUND",
        "This saved application was not found.",
        404,
      );
    if (app.documentStatus !== "ready")
      throw exportError(
        "FILES_NOT_READY",
        "Generate the documents before downloading them.",
        409,
      );
    const batch = await this.database.prisma.documentExport.findFirst({
      where: { applicationId: id, state: "ready" },
    });
    if (!batch)
      throw exportError(
        "FILES_NOT_READY",
        "Generate the documents before downloading them.",
        409,
      );
    return batch;
  }
  async finishDelete(id: string, token: string) {
    await this.assertLease(id, token);
    const deleted = await this.database.prisma.application.deleteMany({
      where: { id, documentToken: token },
    });
    if (!deleted.count)
      throw exportError(
        "DOCUMENTS_BUSY",
        "Deletion could not be completed. Reload History.",
        409,
      );
  }
}
