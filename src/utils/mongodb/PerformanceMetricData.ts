import mongoose, { Schema } from 'mongoose';
import type { PerformanceMetricName } from '@/utils/performance';

export interface IPerformanceMetric {
  name: PerformanceMetricName;
  value: number;
  route: string;
  source?: string;
  cache?: string;
  connection?: string;
  build?: string;
  createdAt: Date;
}

const PerformanceMetricSchema = new Schema<IPerformanceMetric>({
  name: { type: String, required: true, index: true },
  value: { type: Number, required: true },
  route: { type: String, required: true, index: true },
  source: String,
  cache: String,
  connection: String,
  build: String,
  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 * 30, index: true },
}, { versionKey: false });

export const PerformanceMetricModel = mongoose.models.PerformanceMetric
  || mongoose.model<IPerformanceMetric>('PerformanceMetric', PerformanceMetricSchema);
