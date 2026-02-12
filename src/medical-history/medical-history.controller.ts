import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Req,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { MedicalHistoryService } from './medical-history.service';
import { MedicalHistoryDocumentsService } from './medical-history-documents.service';
import { SaveMedicalHistoryDto } from './dto/medical-history.dto';

@Controller('medical-history')
@UseGuards(JwtAuthGuard)
export class MedicalHistoryController {
  constructor(
    private medicalHistoryService: MedicalHistoryService,
    private documentsService: MedicalHistoryDocumentsService,
  ) {}

  @Get()
  async getMine(@Req() req: { user: { tenantId: string; userId: string } }) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    return this.medicalHistoryService.getForUser(tenantId, userId);
  }

  @Post()
  async saveMine(
    @Req() req: { user: { tenantId: string; userId: string } },
    @Body() body: SaveMedicalHistoryDto,
  ) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    return this.medicalHistoryService.saveForUser(tenantId, userId, body);
  }

  /** List current user's documents only (no file URLs – use GET documents/:id to view). */
  @Get('documents')
  async listDocuments(@Req() req: { user: { tenantId: string; userId: string } }) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    return this.documentsService.listForUser(tenantId, userId);
  }

  /** Get document URL only if it belongs to the current user. Secured per-document. */
  @Get('documents/:id')
  async getDocument(
    @Req() req: { user: { tenantId: string; userId: string } },
    @Param('id') id: string,
  ) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    const doc = await this.documentsService.getOne(tenantId, userId, id);
    if (!doc) throw new BadRequestException('Document not found');
    return doc;
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async uploadDocument(
    @Req() req: { user: { tenantId: string; userId: string }; body?: { label?: string } },
    @UploadedFile() file: Express.Multer.File,
  ) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    if (!file || !file.buffer) throw new BadRequestException('No file provided');
    const label = req.body?.label;
    return this.documentsService.upload(tenantId, userId, {
      buffer: file.buffer,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
    }, typeof label === 'string' ? label : undefined);
  }

  @Delete('documents/:id')
  async deleteDocument(
    @Req() req: { user: { tenantId: string; userId: string } },
    @Param('id') id: string,
  ) {
    const tenantId = req.user?.tenantId;
    const userId = req.user?.userId;
    if (!tenantId || !userId) throw new BadRequestException('Unauthorized');
    const ok = await this.documentsService.deleteOne(tenantId, userId, id);
    if (!ok) throw new BadRequestException('Document not found');
    return { success: true };
  }
}

