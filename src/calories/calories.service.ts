import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import OpenAI from 'openai';
import { CalorieEntry } from './schemas/calorie-entry.schema';

/** Default Indian average calorie intake when day is missing (ICMR-style). */
export const DEFAULT_CALORIES_MALE = 2400;
export const DEFAULT_CALORIES_FEMALE = 2000;
/** Fallback when user gender unknown */
export const DEFAULT_CALORIES_UNKNOWN = 2000;

const SYSTEM_PROMPT = `You are a nutrition assistant specialized in Indian diets.
Convert food descriptions into estimated calorie counts.
Use common Indian portions (e.g. 1 katori, 2 idlis, 1 medium chapati).
Use average Indian calorie references (ICMR-style); avoid extreme fitness assumptions.
Respond ONLY with a valid JSON object, no other text. No markdown, no code block.
Format:
{
  "date": "YYYY-MM-DD",
  "items": [
    { "name": "food name", "quantity": "e.g. 2 pieces", "estimatedCalories": number }
  ],
  "totalCalories": number
}
If the user message does not describe food, return: { "error": "Please describe what you ate." }
Use today's date in YYYY-MM-DD for "date" unless the user specifies another date.`;

const EXTEND_PROMPT = `Same rules as above, but the user is ADDING MORE food to an existing day.
You will receive "Existing items for this day: [...]" and "User is adding: ...".
Return JSON with ONLY the NEW items and totalCalories for those new items (not the full day total).
Format: { "date": "YYYY-MM-DD", "items": [ new items only ], "totalCalories": sum of new items only }
If the message does not describe new food, return: { "error": "Please describe what you ate." }`;

export interface ChatCalorieResult {
  date: string;
  items: { name: string; quantity?: string; estimatedCalories: number }[];
  totalCalories: number;
  source: 'user';
  isSystemEstimated?: false;
}

export interface DaySummary {
  date: string;
  totalCalories: number;
  source: 'user' | 'system';
  isSystemEstimated: boolean;
  hasEntry: boolean;
}

@Injectable()
export class CaloriesService {
  private openai: OpenAI | null = null;

  constructor(
    @InjectModel(CalorieEntry.name) private readonly calorieModel: Model<CalorieEntry>,
    private config: ConfigService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    if (apiKey) this.openai = new OpenAI({ apiKey });
  }

  /**
   * Single API: accept chat input, call OpenAI, convert to calories, save to DB.
   * If options.date is set and an entry already exists for that day, merges new items
   * with existing (extend) instead of replacing.
   * Returns structured result for frontend.
   */
  async chat(
    tenantId: string,
    userId: string,
    message: string,
    options?: { date?: string; existingItems?: { name: string; quantity?: string; estimatedCalories: number }[] },
  ): Promise<ChatCalorieResult> {
    if (!this.openai) {
      throw new BadRequestException('Calorie chat is not configured (missing OPENAI_API_KEY)');
    }
    const trimmed = message?.trim();
    if (!trimmed) {
      throw new BadRequestException('Message is required');
    }

    const dateStr = options?.date || this.todayDate();
    const normalizedDate = this.normalizeDate(dateStr);

    // When editing: use provided existingItems (after user removals) or load from DB
    let existingItems: { name: string; quantity?: string; estimatedCalories: number }[] = [];
    let existingTotal = 0;
    if (options?.existingItems?.length) {
      existingItems = options.existingItems;
      existingTotal = existingItems.reduce((sum, i) => sum + (Number(i.estimatedCalories) || 0), 0);
    } else {
      const existing = await this.calorieModel
        .findOne({ tenantId, userId, date: normalizedDate })
        .lean();
      existingItems = (existing?.detailsJson as { items?: { name: string; quantity?: string; estimatedCalories: number }[] })?.items ?? [];
      existingTotal = typeof existing?.totalCalories === 'number' ? existing.totalCalories : 0;
    }
    const isExtend = existingItems.length > 0;

    const userContent = isExtend
      ? `Existing items for this day: ${JSON.stringify(existingItems)}. User is adding more: ${trimmed}. Return ONLY the new items and totalCalories for those new items. Date: ${normalizedDate}.`
      : `Today's date: ${dateStr}. User said: ${trimmed}`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: isExtend ? EXTEND_PROMPT : SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '';
    let parsed: {
      date?: string;
      items?: { name: string; quantity?: string; estimatedCalories: number }[];
      totalCalories?: number;
      error?: string;
    };

    try {
      const jsonStr = content.replace(/^```json?\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new BadRequestException('Could not parse AI response. Please try again.');
    }

    if (parsed.error) {
      throw new BadRequestException(parsed.error);
    }

    const date = parsed.date || normalizedDate;
    const newItems = Array.isArray(parsed.items) ? parsed.items : [];
    const newTotal = typeof parsed.totalCalories === 'number' ? parsed.totalCalories : 0;

    let mergedItems = newItems;
    let mergedTotal = newTotal;
    if (isExtend) {
      mergedItems = [...existingItems, ...newItems];
      mergedTotal = existingTotal + newTotal;
    }

    await this.upsertEntry(tenantId, userId, date, 'user', mergedTotal, {
      items: mergedItems,
      rawMessage: trimmed,
    });

    return {
      date,
      items: mergedItems,
      totalCalories: mergedTotal,
      source: 'user',
    };
  }

  /**
   * Set/replace a day's entry with the given items (e.g. after user removes some).
   * totalCalories = sum of item.estimatedCalories.
   */
  async setEntry(
    tenantId: string,
    userId: string,
    date: string,
    items: { name: string; quantity?: string; estimatedCalories: number }[],
  ): Promise<CalorieEntry> {
    const normalized = this.normalizeDate(date);
    const totalCalories = items.reduce((sum, i) => sum + (Number(i.estimatedCalories) || 0), 0);
    return this.upsertEntry(tenantId, userId, normalized, 'user', totalCalories, {
      items,
      rawMessage: 'Updated by user',
    });
  }

  /** Upsert one calorie entry per user per date (replace if exists). */
  async upsertEntry(
    tenantId: string,
    userId: string,
    date: string,
    source: 'user' | 'system',
    totalCalories: number,
    detailsJson: CalorieEntry['detailsJson'] = {},
  ): Promise<CalorieEntry> {
    const normalized = this.normalizeDate(date);
    const doc = await this.calorieModel.findOneAndUpdate(
      { tenantId, userId, date: normalized },
      {
        $set: {
          source,
          totalCalories,
          detailsJson,
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true },
    );
    return doc as CalorieEntry;
  }

  /** Get today's entry for the user (if any). */
  async getToday(tenantId: string, userId: string): Promise<CalorieEntry | null> {
    const date = this.todayDate();
    const doc = await this.calorieModel.findOne({ tenantId, userId, date }).lean();
    return doc as CalorieEntry | null;
  }

  /**
   * Last 7 days: for each day return summary (totalCalories, source, isSystemEstimated).
   * Missing days are NOT auto-filled here; frontend uses this to show "missing" and offer default.
   */
  async getLast7Days(tenantId: string, userId: string): Promise<DaySummary[]> {
    const today = new Date();
    const out: DaySummary[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateStr = this.toDateStr(d);
      const entry = await this.calorieModel.findOne({ tenantId, userId, date: dateStr }).lean();
      if (entry) {
        out.push({
          date: dateStr,
          totalCalories: entry.totalCalories,
          source: entry.source,
          isSystemEstimated: entry.source === 'system',
          hasEntry: true,
        });
      } else {
        out.push({
          date: dateStr,
          totalCalories: 0,
          source: 'user',
          isSystemEstimated: false,
          hasEntry: false,
        });
      }
    }
    return out;
  }

  /**
   * Get calorie history for a date range (for table and roadmap).
   * Returns entries from fromDate to toDate (inclusive), newest first.
   */
  async getHistory(
    tenantId: string,
    userId: string,
    fromDate: string,
    toDate: string,
  ): Promise<Array<{
    date: string;
    totalCalories: number;
    source: 'user' | 'system';
    isSystemEstimated: boolean;
    detailsJson?: CalorieEntry['detailsJson'];
  }>> {
    const from = this.normalizeDate(fromDate);
    const to = this.normalizeDate(toDate);
    const entries = await this.calorieModel
      .find({
        tenantId,
        userId,
        date: { $gte: from, $lte: to },
      })
      .sort({ date: -1 })
      .lean();
    return (entries as unknown as CalorieEntry[]).map((e) => ({
      date: e.date,
      totalCalories: e.totalCalories,
      source: e.source,
      isSystemEstimated: e.source === 'system',
      detailsJson: e.detailsJson,
    }));
  }

  /** Accept default calorie for a missing day (system-estimated). Gender unknown => use DEFAULT_CALORIES_UNKNOWN. */
  async acceptDefault(
    tenantId: string,
    userId: string,
    date: string,
    gender?: 'male' | 'female',
  ): Promise<CalorieEntry> {
    const normalized = this.normalizeDate(date);
    const total =
      gender === 'male'
        ? DEFAULT_CALORIES_MALE
        : gender === 'female'
          ? DEFAULT_CALORIES_FEMALE
          : DEFAULT_CALORIES_UNKNOWN;
    return this.upsertEntry(tenantId, userId, normalized, 'system', total, {
      items: [],
      rawMessage: 'System-estimated default (Indian average)',
    });
  }

  private todayDate(): string {
    return this.toDateStr(new Date());
  }

  private toDateStr(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  private normalizeDate(date: string): string {
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return this.todayDate();
    return this.toDateStr(d);
  }
}
