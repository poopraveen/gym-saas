import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { TenantsService } from '../tenants/tenants.service';
import { MembersService } from '../members/members.service';
import { TelegramService } from './telegram.service';
import { TelegramOptIn } from './schemas/telegram-opt-in.schema';

const ABSENT_DAYS = [3, 7, 14] as const;
const MOTIVATION = {
  3: 'We miss you! A small step today keeps you on track. 💪',
  7: 'One week without the gym — your body and mind will thank you when you’re back. You’ve got this!',
  14: 'Two weeks is behind you; the next session is the one that counts. Come back stronger! 🌟',
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly tenantsService: TenantsService,
    private readonly membersService: MembersService,
    private readonly telegramService: TelegramService,
    @InjectModel(TelegramOptIn.name) private readonly telegramOptInModel: Model<TelegramOptIn>,
  ) {}

  /** Run absence check for all tenants with Telegram chat ID; send alerts to gym owner. Uses per-tenant bot and chat from DB. */
  async runAbsenceCheck(): Promise<{ sent: number; skipped: number }> {
    const tenants = await this.tenantsService.findAll();
    let sent = 0;
    let skipped = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const t of tenants) {
      const tenant = t as unknown as {
        _id: unknown;
        name?: string;
        settings?: { telegramChatId?: string };
        telegramBotToken?: string;
        telegramChatId?: string;
      };
      const botToken = tenant.telegramBotToken || this.telegramService.getBotToken();
      const chatId = tenant.telegramChatId ?? tenant.settings?.telegramChatId ?? process.env.TELEGRAM_OWNER_CHAT_ID;
      if (!chatId || !botToken) {
        skipped++;
        continue;
      }
      const tenantId = String(tenant._id);
      const members = await this.membersService.list(tenantId);
      const absentByDays: Record<number, { name: string; regNo: number; telegramChatId?: string }[]> = { 3: [], 7: [], 14: [] };

      for (const m of members) {
        const lastCheckIn = (m as Record<string, unknown>)['lastCheckInTime'] as string | undefined;
        const name = String((m as Record<string, unknown>)['NAME'] ?? (m as Record<string, unknown>)['name'] ?? 'Member');
        const regNo = Number((m as Record<string, unknown>)['Reg No:']) || 0;
        const telegramChatId = (m as Record<string, unknown>)['telegramChatId'] as string | undefined;
        let lastDate: Date | null = null;
        if (lastCheckIn && lastCheckIn.trim()) {
          const parsed = new Date(lastCheckIn.trim());
          if (!isNaN(parsed.getTime())) lastDate = parsed;
        }
        lastDate?.setHours(0, 0, 0, 0);
        const daysSince = lastDate ? Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;
        for (const d of ABSENT_DAYS) {
          if (daysSince >= d) absentByDays[d].push({ name, regNo, telegramChatId });
        }
        if (daysSince >= 3 && telegramChatId) {
          const dayBracket = daysSince >= 14 ? 14 : daysSince >= 7 ? 7 : 3;
          const greeting = name && name !== 'Member' ? `Hi ${escapeHtml(name)}, ` : '';
          const personalText = `${greeting}you haven't visited in ${dayBracket}+ days. ${MOTIVATION[dayBracket]}`;
          await this.telegramService.sendMessage(telegramChatId, personalText, botToken);
        }
      }

      const totalAbsent3 = absentByDays[3].length;
      const totalAbsent7 = absentByDays[7].length;
      const totalAbsent14 = absentByDays[14].length;
      if (totalAbsent3 === 0 && totalAbsent7 === 0 && totalAbsent14 === 0) continue;

      const gymName = tenant.name || 'Gym';
      let text = `<b>🏋️ ${escapeHtml(gymName)} – Absence alert</b>\n\n`;
      text += `• <b>${totalAbsent3}</b> member(s) absent 3+ days\n`;
      text += `• <b>${totalAbsent7}</b> member(s) absent 7+ days\n`;
      text += `• <b>${totalAbsent14}</b> member(s) absent 14+ days\n\n`;
      text += '<b>Suggested follow-up messages:</b>\n';
      text += `3 days: ${MOTIVATION[3]}\n`;
      text += `7 days: ${MOTIVATION[7]}\n`;
      text += `14 days: ${MOTIVATION[14]}\n`;
      if (totalAbsent14 > 0) {
        text += `\nMembers absent 14+ days: ${absentByDays[14].slice(0, 10).map((x) => `${x.name} (#${x.regNo})`).join(', ')}`;
        if (absentByDays[14].length > 10) text += ` and ${absentByDays[14].length - 10} more`;
        text += '.';
      }

      const ok = await this.telegramService.sendMessage(chatId, text, botToken);
      if (ok) sent++;
      else skipped++;
    }
    return { sent, skipped };
  }

  /**
   * Handle Telegram webhook for one tenant (path: /telegram-webhook/:tenantId). Logs attempt, matches phone within tenant, replies.
   * User can send /start or Hi first, then send registered phone (digits only or with country code) to opt in for 3/7/14-day reminders.
   */
  async handleTelegramWebhookForTenant(
    tenantId: string,
    update: { message?: { chat?: { id: number }; text?: string } },
  ): Promise<boolean> {
    const tenant = await this.tenantsService.findById(tenantId);
    const t = tenant as Record<string, unknown> | null;
    const botToken = t?.telegramBotToken as string | undefined;
    if (!botToken) return false;

    const message = update?.message;
    const chatId = message?.chat?.id;
    const rawText = (message?.text || '').trim();
    if (chatId == null) return false;
    // Accept /start, "hi", or any text (empty treated as no reply)
    const text = rawText || ' ';
    const digits = text.replace(/\D/g, '');
    const phoneAttempted = digits.length >= 8 ? digits : undefined;
    const gymName = (t?.name as string) || 'this gym';

    let optInDoc: { _id: unknown } | null = null;
    try {
      optInDoc = await this.telegramOptInModel.create({
        tenantId,
        telegramChatId: String(chatId),
        phoneAttempted,
        messageText: text.slice(0, 500),
        status: 'pending',
      });
      this.logger.log(`Telegram opt-in saved tenantId=${tenantId} chatId=${chatId} phoneAttempted=${phoneAttempted ?? '(none)'}`);
    } catch (e) {
      this.logger.warn('Telegram opt-in create failed', e);
    }

    let reply: string;
    let memberId: string | undefined;
    if (digits.length >= 8) {
      const member = await this.membersService.findByPhoneDigits(tenantId, digits);
      if (member) {
        await this.membersService.updateTelegramChatId(tenantId, member.regNo, String(chatId));
        memberId = String((member as unknown as Record<string, unknown>)._id);
        if (optInDoc?._id) {
          await this.telegramOptInModel.updateOne(
            { _id: optInDoc._id },
            { $set: { memberId, status: 'confirmed' } },
          );
        }
        reply = "You're registered for absence alerts! If you don't visit the gym for 3+ days, we'll send you a reminder here.";
      } else {
        reply = `You're not part of ${escapeHtml(gymName)}. Please use the mobile number registered at the gym, or contact the gym to join.`;
      }
    } else {
      reply = "Hi! To get absence alerts (when you're away 3+ days), send your registered gym mobile number — digits only or with country code (e.g. 93436035 or +65 9343 6035). We match by phone number on file.";
    }

    await this.telegramService.sendMessage(String(chatId), reply, botToken);
    return true;
  }

  /** List Telegram opt-in attempts for a tenant (admin view to confirm who tried to set up). */
  async listTelegramAttempts(tenantId: string, params?: { status?: string; limit?: number }) {
    const limit = Math.min(params?.limit ?? 50, 100);
    const filter: Record<string, unknown> = { tenantId };
    if (params?.status) filter.status = params.status;
    const list = await this.telegramOptInModel
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
    return list.map((d) => ({
      _id: (d as Record<string, unknown>)._id,
      telegramChatId: (d as Record<string, unknown>).telegramChatId,
      phoneAttempted: (d as Record<string, unknown>).phoneAttempted,
      messageText: (d as Record<string, unknown>).messageText,
      memberId: (d as Record<string, unknown>).memberId,
      status: (d as Record<string, unknown>).status,
      createdAt: (d as Record<string, unknown>).createdAt,
    }));
  }

  /** Get Telegram config for current tenant (group invite link for QR, hasBot). */
  async getTelegramConfig(tenantId: string): Promise<{ groupInviteLink?: string; hasBot: boolean }> {
    const tenant = await this.tenantsService.findById(tenantId);
    const t = tenant as Record<string, unknown> | null;
    if (!t) {
      this.logger.log(`getTelegramConfig tenantId=${tenantId} tenant=not found`);
      return { hasBot: false };
    }
    const settings = t.settings as Record<string, unknown> | undefined;
    const fromRoot = (t.telegramGroupInviteLink as string)?.trim();
    const fromSettings = (settings?.telegramGroupInviteLink as string)?.trim();
    const groupLink = fromRoot || fromSettings || undefined;
    const hasBot = !!(t.telegramBotToken as string);
    this.logger.log(`getTelegramConfig tenantId=${tenantId} tenantName=${t.name ?? '?'} hasBot=${hasBot} hasGroupLink=${!!groupLink} linkFromRoot=${!!fromRoot} linkFromSettings=${!!fromSettings}`);
    return {
      groupInviteLink: groupLink || undefined,
      hasBot,
    };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
