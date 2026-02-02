import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

/** Per-food nutrition breakdown (macros + micros). */
export interface FoodNutritionBreakdown {
  name: string;
  quantity: string;
  unit: string;
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  vitamins?: {
    vitaminA?: number;
    vitaminBComplex?: number;
    vitaminC?: number;
    vitaminD?: number;
    vitaminE?: number;
  };
  minerals?: {
    calcium?: number;
    iron?: number;
    magnesium?: number;
    potassium?: number;
    sodium?: number;
    zinc?: number;
  };
}

/** Daily totals. */
export interface DailyNutritionTotal {
  calories: number;
  protein: number;
  carbohydrates: number;
  fat: number;
  fiber: number;
  vitamins?: Record<string, number>;
  minerals?: Record<string, number>;
}

/** RDI percentage (0-100+). */
export interface RdiPercentage {
  calories?: number;
  protein?: number;
  carbohydrates?: number;
  fat?: number;
  fiber?: number;
  vitamins?: Record<string, number>;
  minerals?: Record<string, number>;
}

/** Deficiency/excess status. */
export interface NutrientStatus {
  nutrient: string;
  status: 'deficient' | 'slightly_low' | 'optimal' | 'excess';
  message?: string;
  current?: number;
  recommended?: number;
  unit?: string;
}

/** Improvement recommendation. */
export interface ImprovementRecommendation {
  title?: string;
  foods: string[];
  portions?: string[];
  swaps?: string[];
}

@Schema({ timestamps: true, collection: 'nutrition_analyses' })
export class NutritionAnalysis extends Document {
  @Prop({ required: true, index: true })
  tenantId: string;

  @Prop({ required: true, index: true })
  userId: string;

  @Prop({ required: true, index: true })
  date: string;

  @Prop({ type: Array, default: [] })
  meals: Array<{ food: string; quantity: string; unit: string }>;

  @Prop({ type: Object })
  userProfile?: { age?: number; gender?: string; heightCm?: number; weightKg?: number; goal?: string };

  @Prop({ type: Array, default: [] })
  perFood: FoodNutritionBreakdown[];

  @Prop({ type: Object })
  dailyTotal?: DailyNutritionTotal;

  @Prop({ type: Object })
  rdiPercentage?: RdiPercentage;

  @Prop({ type: Array, default: [] })
  deficiencies: NutrientStatus[];

  @Prop({ type: Array, default: [] })
  suggestions: string[];

  @Prop({ type: Array, default: [] })
  improvements: ImprovementRecommendation[];

  @Prop()
  createdAt?: Date;

  @Prop()
  updatedAt?: Date;
}

export const NutritionAnalysisSchema = SchemaFactory.createForClass(NutritionAnalysis);
NutritionAnalysisSchema.index({ tenantId: 1, userId: 1, date: 1 }, { unique: true });
