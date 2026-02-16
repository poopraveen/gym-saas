import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import OpenAI from 'openai';
import { AuthService } from '../auth/auth.service';
import { MembersService } from '../members/members.service';
import { WorkoutPlanService } from '../workout-plan/workout-plan.service';
import { CalorieEntry } from './schemas/calorie-entry.schema';
import {
  NutritionAnalysis,
  FoodNutritionBreakdown,
  DailyNutritionTotal,
  RdiPercentage,
  NutrientStatus,
  ImprovementRecommendation,
} from './schemas/nutrition-analysis.schema';
import { NUTRITION_REFERENCE } from './data/nutrition-reference';

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

const ANALYZE_SYSTEM_PROMPT = `You are a world-class nutritionist and dietitian specializing in Indian diets (ICMR-style).
Given a list of meals (food + quantity + unit), return ONE JSON object with full nutrition analysis. No markdown, no code block.

Reference foods (per 100g or standard serving): Dosa ~133 kcal, 3.6g protein, 22g carbs; Chicken boiled ~165 kcal, 31g protein; Scrambled egg ~196 kcal/100g; Tea with milk/sugar ~35 kcal/100g; Rice white ~130 kcal, brown ~112 kcal; Guava ~68 kcal, 228mg Vitamin C; Idli ~106 kcal; Paneer ~265 kcal, 18g protein; Orange ~47 kcal, 53mg Vitamin C.

Output JSON format (use exact keys):
{
  "perFood": [
    {
      "name": "food name",
      "quantity": "2",
      "unit": "pieces",
      "calories": number,
      "protein": number,
      "carbohydrates": number,
      "fat": number,
      "fiber": number,
      "vitamins": { "vitaminA": number, "vitaminBComplex": number, "vitaminC": number, "vitaminD": number, "vitaminE": number },
      "minerals": { "calcium": number, "iron": number, "magnesium": number, "potassium": number, "sodium": number, "zinc": number }
    }
  ],
  "dailyTotal": {
    "calories": number,
    "protein": number,
    "carbohydrates": number,
    "fat": number,
    "fiber": number,
    "vitamins": { "vitaminA": number, ... },
    "minerals": { "calcium": number, ... }
  },
  "rdiPercentage": {
    "calories": number,
    "protein": number,
    "carbohydrates": number,
    "fat": number,
    "fiber": number,
    "vitamins": { "vitaminA": number, ... },
    "minerals": { "calcium": number, ... }
  },
  "deficiencies": [
    { "nutrient": "string", "status": "deficient" | "slightly_low" | "optimal" | "excess", "message": "short message", "current": number, "recommended": number, "unit": "g" | "mg" | "mcg" | "kcal" }
  ],
  "suggestions": [
    "Your protein intake is low — consider adding eggs, paneer, or chicken",
    "Vitamin C is low — add fruits like guava or orange"
  ],
  "improvements": [
    { "title": "How to Improve Today's Diet", "foods": ["eggs", "paneer"], "portions": ["2 eggs", "50g paneer"], "swaps": ["white rice → brown rice"] }
  ]
}

RDI (Indian adult, 2000 kcal baseline): Protein 50-60g, Carbs 250-300g, Fat 50-65g, Fiber 25-30g. Vitamin C 40mg, Calcium 1000mg, Iron 19mg (F)/29mg (M), etc.
Scale values by quantity (pieces/cups/grams/serving/ml). For liquids use ml (e.g. 1 cup ≈ 240 ml). For status: deficient <70% RDI, slightly_low 70-90%, optimal 90-110%, excess >110%.
Suggestions: simple, food-based, culturally relevant (Indian foods). 2-4 suggestions. Improvements: 2-4 items with foods, portions, optional swaps.`;

@Injectable()
export class CaloriesService {
  private openai: OpenAI | null = null;

  constructor(
    @InjectModel(CalorieEntry.name) private readonly calorieModel: Model<CalorieEntry>,
    @InjectModel(NutritionAnalysis.name) private readonly nutritionAnalysisModel: Model<NutritionAnalysis>,
    private config: ConfigService,
    private authService: AuthService,
    private membersService: MembersService,
    private workoutPlanService: WorkoutPlanService,
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
   * Get RDI profile for the current user. Only members with linkedRegNo have stored profile; others get {}.
   */
  async getProfile(
    tenantId: string,
    userId: string,
  ): Promise<{ age?: number; gender?: string; heightCm?: number; weightKg?: number; goal?: string }> {
    const me = await this.authService.getMe(userId) as { linkedRegNo?: number };
    const regNo = me?.linkedRegNo;
    if (regNo == null || typeof regNo !== 'number') return {};
    return this.membersService.getProfile(tenantId, regNo);
  }

  /**
   * Save RDI profile for the current user. Only members with linkedRegNo can save.
   */
  async saveProfile(
    tenantId: string,
    userId: string,
    profile: { age?: number; gender?: string; heightCm?: number; weightKg?: number; goal?: string },
  ): Promise<void> {
    const me = await this.authService.getMe(userId) as { linkedRegNo?: number };
    const regNo = me?.linkedRegNo;
    if (regNo == null || typeof regNo !== 'number') {
      throw new BadRequestException('Only members can save RDI profile. Link your account to a member first.');
    }
    await this.membersService.updateProfile(tenantId, regNo, profile);
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

  /**
   * One-shot AI nutrition analysis: meals + optional userProfile → full breakdown,
   * daily total, RDI %, deficiencies, suggestions, improvements. Saved by date for tenant/user.
   */
  async analyze(
    tenantId: string,
    userId: string,
    meals: Array<{ food: string; quantity: string; unit: string }>,
    options?: { date?: string; userProfile?: { age?: number; gender?: string; heightCm?: number; weightKg?: number; goal?: string } },
  ): Promise<{
    perFood: FoodNutritionBreakdown[];
    dailyTotal: DailyNutritionTotal;
    rdiPercentage: RdiPercentage;
    deficiencies: NutrientStatus[];
    suggestions: string[];
    improvements: ImprovementRecommendation[];
  }> {
    if (!this.openai) {
      throw new BadRequestException('Nutrition analysis is not configured (missing OPENAI_API_KEY)');
    }
    const dateStr = options?.date || this.todayDate();
    const normalizedDate = this.normalizeDate(dateStr);

    const refSummary = NUTRITION_REFERENCE.map(
      (f) => `${f.name}: ${f.per100g.calories} kcal, P ${f.per100g.protein}g, C ${f.per100g.carbohydrates}g, F ${f.per100g.fat}g, Fiber ${f.per100g.fiber}g`,
    ).join('; ');

    const userContent = `Today's date: ${normalizedDate}.
Reference foods (per 100g): ${refSummary}

User meals to analyze:
${JSON.stringify(meals)}
${options?.userProfile ? `User profile (for RDI): ${JSON.stringify(options.userProfile)}` : 'No user profile — use Indian adult baseline RDI (2000 kcal, protein 55g, etc.).'}

Return the single JSON object with perFood, dailyTotal, rdiPercentage, deficiencies, suggestions, improvements. All numbers must be numeric (no strings).`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ANALYZE_SYSTEM_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 4000,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '';
    let parsed: {
      perFood?: FoodNutritionBreakdown[];
      dailyTotal?: DailyNutritionTotal;
      rdiPercentage?: RdiPercentage;
      deficiencies?: NutrientStatus[];
      suggestions?: string[];
      improvements?: ImprovementRecommendation[];
    };

    try {
      const jsonStr = content.replace(/^```json?\s*|\s*```$/g, '').trim();
      parsed = JSON.parse(jsonStr);
    } catch {
      throw new BadRequestException('Could not parse nutrition analysis. Please try again.');
    }

    const perFood = Array.isArray(parsed.perFood) ? parsed.perFood : [];
    const dailyTotal = parsed.dailyTotal || {
      calories: 0,
      protein: 0,
      carbohydrates: 0,
      fat: 0,
      fiber: 0,
    };
    const rdiPercentage = parsed.rdiPercentage || {};
    const deficiencies = Array.isArray(parsed.deficiencies) ? parsed.deficiencies : [];
    const suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : [];
    const improvements = Array.isArray(parsed.improvements) ? parsed.improvements : [];

    await this.nutritionAnalysisModel.findOneAndUpdate(
      { tenantId, userId, date: normalizedDate },
      {
        $set: {
          meals,
          userProfile: options?.userProfile,
          perFood,
          dailyTotal,
          rdiPercentage,
          deficiencies,
          suggestions,
          improvements,
          updatedAt: new Date(),
        },
      },
      { new: true, upsert: true },
    );

    return { perFood, dailyTotal, rdiPercentage, deficiencies, suggestions, improvements };
  }

  /** Get saved nutrition analysis for a date (tenant/user scoped). */
  async getAnalysis(
    tenantId: string,
    userId: string,
    date: string,
  ): Promise<{
    perFood: FoodNutritionBreakdown[];
    dailyTotal?: DailyNutritionTotal;
    rdiPercentage?: RdiPercentage;
    deficiencies: NutrientStatus[];
    suggestions: string[];
    improvements: ImprovementRecommendation[];
  } | null> {
    const normalized = this.normalizeDate(date);
    const doc = await this.nutritionAnalysisModel
      .findOne({ tenantId, userId, date: normalized })
      .lean();
    if (!doc) return null;
    const d = doc as unknown as NutritionAnalysis;
    return {
      perFood: d.perFood || [],
      dailyTotal: d.dailyTotal,
      rdiPercentage: d.rdiPercentage,
      deficiencies: d.deficiencies || [],
      suggestions: d.suggestions || [],
      improvements: d.improvements || [],
    };
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

  /**
   * Trainer: analyze member activity and return who needs attention (OpenAI).
   * Input: array of { memberName, daysWorkoutMissed, mealFollowedYesterday, lastActivityDate, upcomingRenewalDate }.
   * Output: plain text table "Name | Issue | Risk Level | Suggested Trainer Action" (one line per member).
   */
  async needsAttentionAnalysis(
    members: Array<{
      memberName: string;
      daysWorkoutMissed: number;
      mealFollowedYesterday: boolean;
      lastActivityDate: string;
      upcomingRenewalDate: string;
    }>,
  ): Promise<string> {
    if (!this.openai) {
      throw new BadRequestException('Needs Attention analysis is not configured (missing OPENAI_API_KEY)');
    }
    if (!members?.length) {
      throw new BadRequestException('At least one member is required');
    }

    const NEEDS_ATTENTION_PROMPT = `You are an AI Trainer Assistant.
Analyze today's member activity and identify who needs attention.

For each member:
- Identify the main problem
- Assign risk level (Low / Medium / High)
- Suggest ONE clear action for the trainer

Strict output format — one line per member, pipe-separated:
Name | Issue | Risk Level | Suggested Trainer Action

Do not add a header line. Do not use markdown. Only output the data lines.`;

    const memberLines = members.map(
      (m) =>
        `- ${m.memberName}: Days workout missed: ${m.daysWorkoutMissed}, Meal followed yesterday: ${m.mealFollowedYesterday ? 'Yes' : 'No'}, Last activity date: ${m.lastActivityDate || 'N/A'}, Upcoming renewal date: ${m.upcomingRenewalDate || 'N/A'}`,
    );
    const userContent = `Members to analyze:\n${memberLines.join('\n')}`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: NEEDS_ATTENTION_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.3,
      max_tokens: 800,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '';
    return content || 'No analysis returned.';
  }

  /**
   * Trainer: gather assigned members' data and return AI summary for mobile dashboard.
   * Uses: assigned count, last activity, plan assigned, due dates; outputs strict compact format.
   */
  async assignedMembersSummary(tenantId: string, trainerUserId: string): Promise<string> {
    if (!this.openai) {
      throw new BadRequestException('Assigned summary is not configured (missing OPENAI_API_KEY)');
    }

    const assigned = await this.authService.getAssignedMembersForTrainer(tenantId, trainerUserId);
    const total = assigned.length;
    if (total === 0) {
      return `Assigned Members:\n• Total: 0\n• On track: 0\n• Needs attention: 0\n   - Inactive 3–6 days: 0\n   - Inactive 7+ days: 0\n   - No plan assigned: 0\n• Renewal risk (7 days): 0\n\nTop Actions Today:\n1. No assigned members yet.`;
    }

    const today = this.toDateStr(new Date());
    const sevenDaysAgo = this.toDateStr(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000));
    const gymMembers = await this.membersService.list(tenantId);
    const byRegNo = new Map<number, Record<string, unknown>>();
    for (const m of gymMembers) {
      const reg = Number((m as Record<string, unknown>)['Reg No:']);
      if (!Number.isNaN(reg)) byRegNo.set(reg, m as Record<string, unknown>);
    }

    let onTrack = 0;
    let inactive3to6 = 0;
    let inactive7Plus = 0;
    let noPlanAssigned = 0;
    let renewalRisk7 = 0;
    const needsAttentionIds = new Set<string>();
    const lastActivityDates: string[] = [];
    const planStatuses: string[] = [];
    const renewalStatuses: string[] = [];

    for (const m of assigned) {
      const memberId = m.id;
      const regNo = m.linkedRegNo;
      const gym = regNo != null ? byRegNo.get(regNo) : undefined;
      const dueRaw = gym?.['DUE DATE'] ?? gym?.dueDate;
      const dueDate = dueRaw != null ? new Date(dueRaw as string | number) : null;
      const lastCheckInStr = (gym?.lastCheckInTime as string) || '';
      const lastCheckInDate = lastCheckInStr ? this.toDateStr(new Date(lastCheckInStr)) : null;

      const plan = await this.workoutPlanService.getPlanForUser(tenantId, memberId);
      const hasPlan = !!plan?.days?.length;
      if (!hasPlan) {
        noPlanAssigned++;
        needsAttentionIds.add(memberId);
      }

      const logs = await this.workoutPlanService.getLogsForUser(tenantId, memberId, {
        from: sevenDaysAgo,
        to: today,
        limit: 30,
      });
      const lastLogDate = logs.length > 0 ? logs[0].date : null;

      const calorieDocs = await this.calorieModel
        .find({ tenantId, userId: memberId, date: { $gte: sevenDaysAgo, $lte: today } })
        .select('date')
        .lean();
      const lastCalorieDate =
        calorieDocs.length > 0
          ? (calorieDocs as { date: string }[]).sort((a, b) => b.date.localeCompare(a.date))[0].date
          : null;

      const lastActivity = [lastLogDate, lastCalorieDate, lastCheckInDate].filter(Boolean).sort().reverse()[0] ?? null;
      if (lastActivity) lastActivityDates.push(`${m.name || m.email}: ${lastActivity}`);

      const daysSinceActive = lastActivity
        ? Math.floor((new Date().getTime() - new Date(lastActivity).getTime()) / (24 * 60 * 60 * 1000))
        : 999;
      if (daysSinceActive <= 2) onTrack++;
      else if (daysSinceActive >= 3 && daysSinceActive <= 6) {
        inactive3to6++;
        needsAttentionIds.add(memberId);
      } else if (daysSinceActive >= 7) {
        inactive7Plus++;
        needsAttentionIds.add(memberId);
      }

      if (dueDate && !isNaN(dueDate.getTime())) {
        const daysToDue = Math.floor((dueDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
        if (daysToDue >= 0 && daysToDue <= 7) renewalRisk7++;
        renewalStatuses.push(`${m.name || m.email}: ${dueDate.toISOString().slice(0, 10)} (${daysToDue}d)`);
      }

      planStatuses.push(`${m.name || m.email}: ${hasPlan ? 'Yes' : 'No'}`);
    }

    const needsAttention = needsAttentionIds.size;

    const ASSIGNED_SUMMARY_PROMPT = `You are an AI Trainer Assistant.
Summarize the trainer's assigned members in the most compact way possible for a mobile dashboard.

Rules:
- No long explanations
- No full member list
- Focus only on action
- Use numbers, not paragraphs
- Clear, minimal, trainer-friendly tone.

Output format (STRICT):

Assigned Members:
• Total: X
• On track: X
• Needs attention: X
   - Inactive 3–6 days: X
   - Inactive 7+ days: X
   - No plan assigned: X
• Renewal risk (7 days): X

Top Actions Today:
1. [Action in 1 short line]
2. [Action in 1 short line]
3. [Optional]

Output only the above. No other text.`;

    const userContent = `Input data (use these numbers and derive actions):
- Assigned members count: ${total}
- On track (active in last 2 days): ${onTrack}
- Needs attention total: ${needsAttention}
  - Inactive 3–6 days: ${inactive3to6}
  - Inactive 7+ days: ${inactive7Plus}
  - No plan assigned: ${noPlanAssigned}
- Renewal risk (due in next 7 days): ${renewalRisk7}

Last activity dates (sample): ${lastActivityDates.slice(0, 10).join('; ') || 'N/A'}
Plan assigned (sample): ${planStatuses.slice(0, 10).join('; ') || 'N/A'}
Upcoming renewals (sample): ${renewalStatuses.slice(0, 10).join('; ') || 'N/A'}

Generate the strict format output with these numbers and 1–3 concrete top actions.`;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: ASSIGNED_SUMMARY_PROMPT },
        { role: 'user', content: userContent },
      ],
      temperature: 0.2,
      max_tokens: 500,
    });

    const content = completion.choices[0]?.message?.content?.trim() || '';
    return content || 'No summary returned.';
  }
}
