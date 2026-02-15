import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import * as webPush from 'web-push';
import { TenantsService } from '../tenants/tenants.service';
import { MembersService } from '../members/members.service';
import { AttendanceService } from '../attendance/attendance.service';
import { TelegramService } from './telegram.service';
import { TelegramOptIn } from './schemas/telegram-opt-in.schema';
import { PushSubscriptionDoc } from './schemas/push-subscription.schema';

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
    private readonly configService: ConfigService,
    private readonly tenantsService: TenantsService,
    private readonly membersService: MembersService,
    private readonly attendanceService: AttendanceService,
    private readonly telegramService: TelegramService,
    @InjectModel(TelegramOptIn.name) private readonly telegramOptInModel: Model<TelegramOptIn>,
    @InjectModel(PushSubscriptionDoc.name) private readonly pushSubscriptionModel: Model<PushSubscriptionDoc>,
  ) {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    if (publicKey && privateKey) {
      webPush.setVapidDetails('mailto:support@gym-saas.example.com', publicKey, privateKey);
    }
  }

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

  /** True if the message is an attendance command (e.g. "attendance", "present", "/attendance"). */
  private isAttendanceCommand(text: string): boolean {
    const t = text.toLowerCase().trim().replace(/\s+/g, ' ');
    return (
      t === 'attendance' ||
      t === 'present' ||
      t === 'check in' ||
      t === 'checkin' ||
      t === 'mark' ||
      t === '/attendance' ||
      t === '/present' ||
      t === '/checkin'
    );
  }

  /**
   * Handle Telegram webhook for one tenant (path: /telegram-webhook/:tenantId).
   * - If sender is already enrolled (telegramChatId linked): "attendance" / "present" marks check-in for today and replies with date/time.
   * - Otherwise: opt-in flow (send phone to register for absence alerts).
   */
  async handleTelegramWebhookForTenant(
    tenantId: string,
    update: { message?: { chat?: { id: number }; text?: string } },
  ): Promise<boolean> {
    const tenant = await this.tenantsService.findById(tenantId);
    const t = tenant as Record<string, unknown> | null;
    if (!t) {
      this.logger.warn(`handleTelegramWebhookForTenant: tenant not found tenantId=${tenantId}`);
      return false;
    }
    const botToken = t?.telegramBotToken as string | undefined;
    if (!botToken) {
      this.logger.warn(`handleTelegramWebhookForTenant: no bot token tenantId=${tenantId}`);
      return false;
    }

    const message = update?.message;
    const chatId = message?.chat?.id;
    const rawText = (message?.text || '').trim();
    if (chatId == null) return false;
    const text = rawText || ' ';
    const gymName = (t?.name as string) || 'this gym';

    // Already enrolled member: mark attendance when they send "attendance" / "present" etc.
    const existingMember = await this.membersService.findByTelegramChatId(tenantId, String(chatId));
    if (existingMember) {
      if (this.isAttendanceCommand(text)) {
        const regNo = Number((existingMember['Reg No:'] ?? existingMember.regNo) || 0);
        if (regNo) {
          await this.attendanceService.checkIn(tenantId, regNo);
          const now = new Date();
          const dateTimeStr = now.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
          const reply = `✅ Attendance marked for ${dateTimeStr}. It will show in the gym's attendance tab.`;
          await this.telegramService.sendMessage(String(chatId), reply, botToken);
          this.logger.log(`Telegram attendance marked tenantId=${tenantId} chatId=${chatId} regNo=${regNo}`);
          return true;
        }
      }
      const reply =
        "You're already registered. Send <b>attendance</b> or <b>present</b> to mark your visit for today.";
      await this.telegramService.sendMessage(String(chatId), reply, botToken);
      return true;
    }

    // New user: opt-in flow (phone number to link for absence alerts)
    const digits = text.replace(/\D/g, '');
    const phoneAttempted = digits.length >= 8 ? digits : undefined;
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
        reply =
          "You're registered! Send <b>attendance</b> or <b>present</b> anytime to mark your visit for the day. You'll also get absence reminders if you don't visit for 3+ days.";
      } else {
        reply = `You're not part of ${escapeHtml(gymName)}. Please use the mobile number registered at the gym, or contact the gym to join.`;
      }
    } else {
      if (this.isAttendanceCommand(text)) {
        reply =
          "To mark attendance, you need to <b>enroll first</b>. Send your registered gym mobile number (digits only or with country code). After you're enrolled, send <b>attendance</b> or <b>present</b> to mark your visit for the day.";
      } else {
        reply =
          "Hi! To enroll and mark attendance, send your <b>registered gym mobile number</b> (digits only or with country code). After that you can send <b>attendance</b> or <b>present</b> to mark your visit for the day.";
      }
    }

    await this.telegramService.sendMessage(String(chatId), reply, botToken);
    return true;
  }

  /** Delete one Telegram opt-in attempt by id (tenant-scoped). */
  async deleteTelegramAttempt(tenantId: string, attemptId: string): Promise<boolean> {
    const result = await this.telegramOptInModel.deleteOne({
      _id: attemptId,
      tenantId,
    });
    return result.deletedCount === 1;
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

  /** Get number of push subscriptions (devices) for this tenant. */
  async getSubscriberCount(tenantId: string): Promise<number> {
    return this.pushSubscriptionModel.countDocuments({ tenantId });
  }

  /** Get VAPID public key for push subscription (frontend uses this in pushManager.subscribe). */
  getVapidPublicKey(): string | null {
    return this.configService.get<string>('VAPID_PUBLIC_KEY') || null;
  }

  /** Save or update push subscription for a user (one doc per endpoint; same user can have multiple devices). */
  async savePushSubscription(
    tenantId: string,
    userId: string,
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
    userAgent?: string,
  ): Promise<void> {
    await this.pushSubscriptionModel.updateOne(
      { endpoint: subscription.endpoint },
      {
        $set: {
          tenantId,
          userId,
          endpoint: subscription.endpoint,
          keys: subscription.keys,
          userAgent: userAgent ?? undefined,
        },
      },
      { upsert: true },
    );
  }

  /** Remove all push subscriptions for a user. */
  async removePushSubscription(tenantId: string, userId: string): Promise<number> {
    const result = await this.pushSubscriptionModel.deleteMany({ tenantId, userId });
    return result.deletedCount ?? 0;
  }

  /**
   * Send a push notification to a user. Call from your business logic (e.g. new enquiry, renewal reminder).
   * Removes subscription on 410 Gone / 404 Not Found.
   */
  async sendPushToUser(
    tenantId: string,
    userId: string,
    payload: { title: string; body?: string; url?: string },
  ): Promise<{ sent: number; failed: number }> {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) {
      this.logger.warn('Push not configured: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
      return { sent: 0, failed: 0 };
    }
    const subs = await this.pushSubscriptionModel.find({ tenantId, userId }).lean();
    let sent = 0;
    let failed = 0;
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      url: payload.url ?? '/',
    });
    for (const sub of subs) {
      const s = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
      try {
        await webPush.sendNotification(s, body);
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          await this.pushSubscriptionModel.deleteOne({ endpoint: sub.endpoint });
        }
        failed++;
        this.logger.warn(`Push send failed userId=${userId} endpoint=${sub.endpoint} status=${status}`, err);
      }
    }
    return { sent, failed };
  }

  /**
   * Send a push notification to all users in the tenant who have enabled push (e.g. holiday, announcement).
   * Removes invalid subscriptions on 410/404.
   */
  async sendPushToTenantSubscribers(
    tenantId: string,
    payload: { title: string; body?: string; url?: string },
  ): Promise<{ sent: number; failed: number; subscriberCount: number }> {
    const publicKey = this.configService.get<string>('VAPID_PUBLIC_KEY');
    const privateKey = this.configService.get<string>('VAPID_PRIVATE_KEY');
    if (!publicKey || !privateKey) {
      this.logger.warn('Push not configured: set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY');
      return { sent: 0, failed: 0, subscriberCount: 0 };
    }
    const subs = await this.pushSubscriptionModel.find({ tenantId }).lean();
    const subscriberCount = subs.length;
    let sent = 0;
    let failed = 0;
    const body = JSON.stringify({
      title: payload.title,
      body: payload.body ?? '',
      url: payload.url ?? '/',
    });
    for (const sub of subs) {
      const s = { endpoint: sub.endpoint, keys: { p256dh: sub.keys.p256dh, auth: sub.keys.auth } };
      try {
        await webPush.sendNotification(s, body);
        sent++;
      } catch (err: unknown) {
        const status = (err as { statusCode?: number })?.statusCode;
        if (status === 410 || status === 404) {
          await this.pushSubscriptionModel.deleteOne({ endpoint: sub.endpoint });
        }
        failed++;
        this.logger.warn(`Push broadcast failed tenantId=${tenantId} endpoint=${sub.endpoint} status=${status}`, err);
      }
    }
    this.logger.log(`Push broadcast tenantId=${tenantId} sent=${sent} failed=${failed} subscriberCount=${subscriberCount}`);
    return { sent, failed, subscriberCount };
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
