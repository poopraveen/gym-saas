import { Injectable } from '@nestjs/common';
import { TenantsService } from '../tenants/tenants.service';
import { MembersService } from '../members/members.service';
import { TelegramService } from './telegram.service';

const ABSENT_DAYS = [3, 7, 14] as const;
const MOTIVATION = {
  3: 'We miss you! A small step today keeps you on track. 💪',
  7: 'One week without the gym — your body and mind will thank you when you’re back. You’ve got this!',
  14: 'Two weeks is behind you; the next session is the one that counts. Come back stronger! 🌟',
};

@Injectable()
export class NotificationsService {
  constructor(
    private readonly tenantsService: TenantsService,
    private readonly membersService: MembersService,
    private readonly telegramService: TelegramService,
  ) {}

  /** Run absence check for all tenants with Telegram chat ID; send alerts to gym owner. */
  async runAbsenceCheck(): Promise<{ sent: number; skipped: number }> {
    if (!this.telegramService.getBotToken()) {
      return { sent: 0, skipped: 0 };
    }
    const tenants = await this.tenantsService.findAll();
    let sent = 0;
    let skipped = 0;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (const t of tenants) {
      const tenant = t as unknown as { _id: unknown; name?: string; settings?: { telegramChatId?: string } };
      const chatId = tenant.settings?.telegramChatId || process.env.TELEGRAM_OWNER_CHAT_ID;
      if (!chatId) {
        skipped++;
        continue;
      }
      const tenantId = String(tenant._id);
      const members = await this.membersService.list(tenantId);
      const absentByDays: Record<number, { name: string; regNo: number }[]> = { 3: [], 7: [], 14: [] };

      for (const m of members) {
        const lastCheckIn = (m as Record<string, unknown>)['lastCheckInTime'] as string | undefined;
        const name = String((m as Record<string, unknown>)['NAME'] ?? (m as Record<string, unknown>)['name'] ?? 'Member');
        const regNo = Number((m as Record<string, unknown>)['Reg No:']) || 0;
        let lastDate: Date | null = null;
        if (lastCheckIn && lastCheckIn.trim()) {
          const parsed = new Date(lastCheckIn.trim());
          if (!isNaN(parsed.getTime())) lastDate = parsed;
        }
        lastDate?.setHours(0, 0, 0, 0);
        const daysSince = lastDate ? Math.floor((today.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24)) : 999;
        for (const d of ABSENT_DAYS) {
          if (daysSince >= d) absentByDays[d].push({ name, regNo });
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

      const ok = await this.telegramService.sendMessage(chatId, text);
      if (ok) sent++;
      else skipped++;
    }
    return { sent, skipped };
  }
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
